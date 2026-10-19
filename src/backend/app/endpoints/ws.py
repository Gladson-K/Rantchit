from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
from sqlalchemy import select

from ..database import async_session
from ..models import Room
from ..redis_client import redis_client
from ..websocket_manager import manager
from ..config import settings
from ..security import hash_ip, now_utc, ensure_aware, is_allowed_ws_origin, is_valid_p256_uncompressed_b64

logger = logging.getLogger("rantchit.ws")
router = APIRouter()

MAX_PUBKEY_FRAMES_PER_CONNECTION = 4
PUBKEY_FRAME_MAX_BYTES = 512

async def validate_and_consume_token(room_id: str, token: str) -> bool:
    token_key = f"room:{room_id}:token:{token}"
    try:
        # Atomic single-use consume when Redis >= 6.2 supports GETDEL.
        try:
            val = await redis_client.getdel(token_key)
        except (AttributeError, NotImplementedError, Exception):
            val = await redis_client.get(token_key)
            if val is not None:
                await redis_client.delete(token_key)
        return val == "valid"
    except Exception as e:
        logger.error(f"Redis error validating token: {e}")
    return False

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    # 1. Exact-match Origin check (blocks cross-site WebSocket hijacking)
    origin = websocket.headers.get("origin")
    if not is_allowed_ws_origin(origin):
        logger.warning(f"Rejected websocket origin: {origin!r}")
        await websocket.close(code=1008, reason="Invalid origin")
        return

    # 2. Extract query parameters
    room_id = websocket.query_params.get("room_id")
    token = websocket.query_params.get("token")
    if not room_id or not token:
        await websocket.close(code=1008, reason="Missing room_id or token parameter")
        return
    import uuid as _uuid
    try:
        room_uuid = _uuid.UUID(room_id)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid room_id format")
        return

    # 3. Validate one-time join token in Redis
    if not await validate_and_consume_token(room_id, token):
        await websocket.close(code=1008, reason="Invalid or expired join token")
        return

    # 4. Check room status in Postgres
    async with async_session() as db:
        try:
            result = await db.execute(select(Room).where(Room.id == room_uuid))
            room = result.scalar_one_or_none()
            if not room:
                await websocket.close(code=1008, reason="Room does not exist")
                return
            if room.status != "active":
                await websocket.close(code=1008, reason=f"Room is {room.status}")
                return
            if now_utc() > ensure_aware(room.expires_at):
                room.status = "expired"
                await db.commit()
                await websocket.close(code=1008, reason="Room has expired")
                return
            room_expires_at = ensure_aware(room.expires_at)
        except Exception as e:
            logger.error(f"Database error checking room: {e}")
            await websocket.close(code=1011, reason="Internal server error")
            return

    # 5. Atomic slot claim — authoritative capacity cap at connect time.
    slot_key = f"room:{room_id}:slots"
    slot_claimed = False
    try:
        current = await redis_client.incr(slot_key)
        if current > 2:
            await redis_client.decr(slot_key)
            await websocket.close(code=1008, reason="Room is full (maximum 2 participants reached)")
            return
        ttl_seconds = max(10, int((room_expires_at - now_utc()).total_seconds()))
        await redis_client.expire(slot_key, ttl_seconds)
        slot_claimed = True
    except Exception as e:
        logger.error(f"Redis slot claim error: {e}")
        await websocket.close(code=1011, reason="Internal server error")
        return

    # 6. Accept WebSocket and register with manager
    await websocket.accept()
    await manager.connect(room_id, websocket)
    pubkey_frames_seen = 0

    try:
        await manager.send_personal(websocket, {
            "type": "connected",
            "room_id": room_id,
            "participants": manager.get_participant_count(room_id)
        })

        # Send ephemeral public keys of any already-connected peers (never our own).
        for peer_key in manager.get_peer_pubkeys(room_id, exclude=websocket):
            await manager.send_personal(websocket, {
                "type": "peer_public_key",
                "public_key": peer_key
            })

        await manager.broadcast_to_room(room_id, {
            "type": "peer_joined",
            "participants": manager.get_participant_count(room_id)
        }, exclude=websocket)

        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except Exception:
                continue

            if not isinstance(data, dict):
                continue
            msg_type = data.get("type")

            if msg_type == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
                continue

            # Ephemeral public key exchange (validated, size-capped, rate-capped)
            if msg_type == "public_key":
                if len(raw_data) > PUBKEY_FRAME_MAX_BYTES:
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "message": "Public key frame too large."
                    })
                    continue
                pub_key = data.get("public_key")
                if not pub_key or not is_valid_p256_uncompressed_b64(pub_key):
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "message": "Invalid public key format."
                    })
                    continue
                pubkey_frames_seen += 1
                if pubkey_frames_seen > MAX_PUBKEY_FRAMES_PER_CONNECTION:
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "message": "Too many key exchange frames."
                    })
                    continue

                manager.set_pubkey(room_id, websocket, pub_key)

                # Relay to the other participant(s) only — no self-echo.
                await manager.broadcast_to_room(room_id, {
                    "type": "peer_public_key",
                    "public_key": pub_key
                }, exclude=websocket)
                continue

            # Mutual key confirmation tag relay (XBF-MKC v1): opaque HMAC tag,
            # never inspected or persisted — only size-capped and relayed.
            if msg_type == "key_confirm":
                tag = data.get("tag")
                if not isinstance(tag, str) or len(tag) > 100 or len(raw_data) > 256:
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "message": "Invalid key confirmation frame."
                    })
                    continue
                await manager.broadcast_to_room(room_id, {
                    "type": "key_confirm",
                    "tag": tag
                }, exclude=websocket)
                continue

            # Encrypted message relay — server NEVER inspects encrypted_payload.
            if msg_type == "message":
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

                if len(raw_data) > settings.MESSAGE_MAX_BYTES:
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "message": "Message exceeds maximum allowed size (16 KB)."
                    })
                    continue

                await manager.broadcast_to_room(room_id, data, exclude=websocket)
                continue

            if msg_type == "destroy":
                async with async_session() as db:
                    result = await db.execute(select(Room).where(Room.id == room_uuid))
                    r = result.scalar_one_or_none()
                    if r:
                        r.status = "destroyed"
                        r.destroyed_at = now_utc()
                        await db.commit()

                await manager.close_room_connections(room_id, code=1000, reason="Room destroyed by participant")
                try:
                    await redis_client.delete(f"room:{room_id}:slots")
                except Exception:
                    pass
                slot_claimed = False
                break

            if msg_type == "leave":
                break

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected gracefully from room {room_id}")
    except Exception as e:
        logger.error(f"WebSocket error in room {room_id}: {e}")
    finally:
        await manager.disconnect(room_id, websocket)
        # Release the participant slot so refresh/rejoin works within TTL.
        if slot_claimed:
            try:
                remaining = await redis_client.decr(slot_key)
                if remaining <= 0:
                    await redis_client.delete(slot_key)
            except Exception as e:
                logger.warning(f"Failed to release slot for room {room_id}: {e}")
        try:
            await manager.broadcast_to_room(room_id, {
                "type": "participant_left",
                "participants": manager.get_participant_count(room_id)
            })
        except Exception:
            pass
