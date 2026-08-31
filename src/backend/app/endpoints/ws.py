from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import async_session
from ..models import Room
from ..redis_client import redis_client
from ..websocket_manager import manager
from ..config import settings
from ..security import hash_ip, now_utc

logger = logging.getLogger("rantchit.ws")
router = APIRouter()

async def validate_origin(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    # In local testing or direct container bridge calls, origin may be missing
    if not origin:
        return True
    if "*" in settings.ALLOWED_ORIGINS or origin in settings.ALLOWED_ORIGINS:
        return True
    # Relax for localhost origins
    if "localhost" in origin or "127.0.0.1" in origin:
        return True
    logger.warning(f"Rejected origin: {origin}")
    await websocket.close(code=1008, reason="Invalid origin")
    return False

async def validate_and_consume_token(room_id: str, token: str) -> bool:
    token_key = f"room:{room_id}:token:{token}"
    try:
        val = await redis_client.get(token_key)
        if val == "valid":
            # Consume single-use token
            await redis_client.delete(token_key)
            return True
    except Exception as e:
        logger.error(f"Redis error validating token: {e}")
    return False

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    # 1. Origin check
    if not await validate_origin(websocket):
        return

    # 2. Extract query parameters
    room_id = websocket.query_params.get("room_id")
    token = websocket.query_params.get("token")
    if not room_id or not token:
        await websocket.close(code=1008, reason="Missing room_id or token parameter")
        return

    # 3. Validate one-time join token in Redis
    if not await validate_and_consume_token(room_id, token):
        await websocket.close(code=1008, reason="Invalid or expired join token")
        return

    # 4. Check room status in Postgres
    async with async_session() as db:
        try:
            result = await db.execute(select(Room).where(Room.id == room_id))
            room = result.scalar_one_or_none()
            if not room:
                await websocket.close(code=1008, reason="Room does not exist")
                return
            if room.status != "active":
                await websocket.close(code=1008, reason=f"Room is {room.status}")
                return
            if now_utc() > room.expires_at:
                room.status = "expired"
                await db.commit()
                await websocket.close(code=1008, reason="Room has expired")
                return
            room_expires_at = room.expires_at
        except Exception as e:
            logger.error(f"Database error checking room: {e}")
            await websocket.close(code=1011, reason="Internal server error")
            return

    # 5. Accept WebSocket and register with manager
    await websocket.accept()
    await manager.connect(room_id, websocket)

    try:
        # Acknowledge connection
        await manager.send_personal(websocket, {
            "type": "connected",
            "room_id": room_id,
            "participants": manager.get_participant_count(room_id)
        })

        # If another participant is already present, notify this connection with their public key if stored
        creator_pubkey = await redis_client.get(f"room:{room_id}:creator_pubkey")
        peer_pubkey = await redis_client.get(f"room:{room_id}:peer_pubkey")
        
        if creator_pubkey:
            await manager.send_personal(websocket, {
                "type": "peer_public_key",
                "public_key": creator_pubkey
            })
        elif peer_pubkey:
            await manager.send_personal(websocket, {
                "type": "peer_public_key",
                "public_key": peer_pubkey
            })

        # Notify other participant in the room that someone joined
        await manager.broadcast_to_room(room_id, {
            "type": "peer_joined",
            "participants": manager.get_participant_count(room_id)
        }, exclude=websocket)

        # Message processing loop
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except Exception:
                continue

            msg_type = data.get("type")

            # Heartbeat ping/pong
            if msg_type == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
                continue

            # Public key exchange
            if msg_type == "public_key":
                pub_key = data.get("public_key")
                if pub_key:
                    ttl_seconds = max(10, int((room_expires_at - now_utc()).total_seconds()))
                    creator_existing = await redis_client.get(f"room:{room_id}:creator_pubkey")
                    
                    if not creator_existing:
                        # Store as creator key
                        await redis_client.set(f"room:{room_id}:creator_pubkey", pub_key, ex=ttl_seconds)
                    else:
                        # Store as peer key
                        await redis_client.set(f"room:{room_id}:peer_pubkey", pub_key, ex=ttl_seconds)

                    # Relay public key to the other participant
                    await manager.broadcast_to_room(room_id, {
                        "type": "peer_public_key",
                        "public_key": pub_key
                    }, exclude=websocket)
                continue

            # Encrypted message relay
            if msg_type == "message":
                # Rate limit per IP
                client_ip = websocket.client.host if websocket.client else "127.0.0.1"
                ip_hash = hash_ip(client_ip)
                rate_key = f"ratelimit:ip:{ip_hash}:messages"
                current_rate = await redis_client.incr(rate_key)
                if current_rate == 1:
                    await redis_client.expire(rate_key, 60)
                if current_rate > settings.RATE_LIMIT_MESSAGES_PER_MINUTE:
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "message": "Message rate limit exceeded. Please slow down."
                    })
                    continue

                # Enforce maximum payload size
                if len(raw_data) > settings.MESSAGE_MAX_BYTES:
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "message": "Message exceeds maximum allowed size (16 KB)."
                    })
                    continue

                # Forward the exact encrypted envelope to the other participant
                await manager.broadcast_to_room(room_id, data, exclude=websocket)
                continue

            # Room destruction requested via WebSocket
            if msg_type == "destroy":
                async with async_session() as db:
                    result = await db.execute(select(Room).where(Room.id == room_id))
                    r = result.scalar_one_or_none()
                    if r:
                        r.status = "destroyed"
                        r.destroyed_at = now_utc()
                        await db.commit()
                
                await manager.close_room_connections(room_id, code=1000, reason="Room destroyed by participant")
                try:
                    await redis_client.delete(
                        f"room:{room_id}:slots",
                        f"room:{room_id}:creator_pubkey",
                        f"room:{room_id}:peer_pubkey"
                    )
                except Exception:
                    pass
                break

            if msg_type == "leave":
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected gracefully from room {room_id}")
    except Exception as e:
        logger.error(f"WebSocket error in room {room_id}: {e}")
    finally:
        await manager.disconnect(room_id, websocket)
        # Notify remaining peer
        await manager.broadcast_to_room(room_id, {
            "type": "participant_left",
            "participants": manager.get_participant_count(room_id)
        })