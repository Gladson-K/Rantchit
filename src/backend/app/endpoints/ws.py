from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
import json
import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import redis.asyncio as redis

from ..database import async_session
from ..models import Room
from ..redis_client import redis_client
from ..websocket_manager import manager
from ..config import settings
from ..security import hash_ip

logger = logging.getLogger("veilchat.ws")
router = APIRouter()

async def validate_origin(websocket: WebSocket):
    origin = websocket.headers.get("origin")
    if origin not in settings.ALLOWED_ORIGINS:
        await websocket.close(code=1008, reason="Invalid origin")
        return False
    return True

async def validate_token(room_id: str, token: str) -> bool:
    token_key = f"room:{room_id}:token:{token}"
    val = await redis_client.get(token_key)
    if val == "valid":
        # Consume token (one-time)
        await redis_client.delete(token_key)
        return True
    return False

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    # Validate Origin
    if not await validate_origin(websocket):
        return

    # Parse query parameters
    room_id = websocket.query_params.get("room_id")
    token = websocket.query_params.get("token")
    if not room_id or not token:
        await websocket.close(code=1008, reason="Missing room_id or token")
        return

    # Validate token in Redis
    if not await validate_token(room_id, token):
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    # Check room exists and is active
    async with async_session() as db:
        result = await db.execute(select(Room).where(Room.id == room_id))
        room = result.scalar_one_or_none()
        if not room or room.status != "active":
            await websocket.close(code=1008, reason="Room not active")
            return
        if datetime.now(timezone.utc) > room.expires_at:
            room.status = "expired"
            await db.commit()
            await websocket.close(code=1008, reason="Room expired")
            return

    # Accept connection and add to manager
    await manager.connect(room_id, websocket)
    try:
        # Send welcome with peer public key (if already present)
        peer_pubkey = await redis_client.get(f"room:{room_id}:peer_pubkey")
        if peer_pubkey:
            await manager.send_personal(websocket, {"type": "peer_public_key", "public_key": peer_pubkey})

        while True:
            # Receive message
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "ping":
                await manager.send_personal(websocket, {"type": "pong"})
                continue

            if msg_type == "public_key":
                # Store creator's public key (first participant)
                # Only store if not already set (creator)
                existing = await redis_client.get(f"room:{room_id}:peer_pubkey")
                if not existing:
                    await redis_client.set(
                        f"room:{room_id}:peer_pubkey",
                        data.get("public_key"),
                        ex=int((room.expires_at - datetime.now(timezone.utc)).total_seconds())
                    )
                    # Notify other participant
                    await manager.broadcast_to_room(room_id, {
                        "type": "peer_public_key",
                        "public_key": data.get("public_key")
                    }, exclude=websocket)
                continue

            if msg_type == "message":
                # Rate limit per connection
                ip = websocket.client.host
                ip_hash = hash_ip(ip)
                rate_key = f"ratelimit:ip:{ip_hash}:messages"
                current = await redis_client.incr(rate_key)
                if current == 1:
                    await redis_client.expire(rate_key, 60)
                if current > settings.RATE_LIMIT_MESSAGES_PER_MINUTE:
                    await websocket.close(code=1008, reason="Message rate limit exceeded")
                    return

                # Check message size
                payload_size = len(json.dumps(data))
                if payload_size > settings.MESSAGE_MAX_BYTES:
                    await websocket.close(code=1009, reason="Message too large")
                    return

                # Relay encrypted message to other participant
                await manager.broadcast_to_room(room_id, data, exclude=websocket)
                continue

            # Unknown type ignore
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        # Notify other participant
        await manager.broadcast_to_room(room_id, {"type": "participant_left"})
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(room_id, websocket)
        await manager.broadcast_to_room(room_id, {"type": "participant_left"})