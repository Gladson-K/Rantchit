from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
from datetime import timedelta
import logging

from ..database import async_session
from ..models import Room
from ..schemas import RoomCreate, RoomResponse, RoomInfoResponse, JoinTokenRequest, JoinTokenResponse, RoomDestroyRequest
from ..security import (
    hash_room_secret,
    generate_join_token,
    hash_ip,
    now_utc,
    ensure_aware,
    get_client_ip,
    safe_secret_compare,
)
from ..config import settings
from ..redis_client import redis_client
from ..websocket_manager import manager

logger = logging.getLogger("rantchit.rooms")
router = APIRouter(prefix="/api/v1/rooms", tags=["rooms"])

async def get_db():
    async with async_session() as session:
        yield session

async def _enforce_rate_limit(rate_key: str, limit: int, window_seconds: int, message: str):
    """Fail-closed atomic-ish fixed-window rate limiter. Raises 429 when exhausted."""
    current = await redis_client.get(rate_key)
    if current and int(current) >= limit:
        raise HTTPException(status_code=429, detail=message)
    pipe = redis_client.pipeline()
    pipe.incr(rate_key)
    pipe.expire(rate_key, window_seconds, nx=True)
    await pipe.execute()

@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: RoomCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    client_ip = get_client_ip(request)
    ip_hash = hash_ip(client_ip)
    rate_key = f"ratelimit:ip:{ip_hash}:create"

    try:
        await _enforce_rate_limit(
            rate_key,
            settings.RATE_LIMIT_CREATE_PER_HOUR,
            3600,
            "Too many rooms created. Please wait before creating another.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Redis rate limiting error (falling back): {e}")

    expires_in = min(payload.expires_in_minutes, settings.ROOM_MAX_TTL_MINUTES)
    expires_at = now_utc() + timedelta(minutes=expires_in)

    # Host-chosen participant cap, always clamped to the server's configured ceiling.
    max_participants = max(2, min(payload.max_participants, settings.ROOM_MAX_PARTICIPANTS_LIMIT))

    room = Room(
        id=uuid.uuid4(),
        secret_hash=payload.room_secret_hash,
        status="active",
        expires_at=expires_at,
        max_participants=max_participants,
        participant_count=0,
        ip_hash=ip_hash,
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)

    logger.info(f"Room created: {room.id} (max {room.max_participants}), expires at {room.expires_at}")
    return RoomResponse(
        room_id=room.id,
        expires_at=room.expires_at,
        max_participants=room.max_participants,
        status=room.status
    )

@router.get("/{room_id}", response_model=RoomInfoResponse)
async def get_room_info(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    is_expired = False
    if now_utc() > ensure_aware(room.expires_at) and room.status == "active":
        room.status = "expired"
        await db.commit()
        is_expired = True
    elif room.status == "expired":
        is_expired = True

    active_count = manager.get_participant_count(str(room_id))
    return RoomInfoResponse(
        room_id=room.id,
        status=room.status,
        created_at=room.created_at,
        expires_at=room.expires_at,
        max_participants=room.max_participants,
        participant_count=active_count,
        is_expired=is_expired
    )

@router.post("/{room_id}/join-token", response_model=JoinTokenResponse)
async def get_join_token(
    room_id: uuid.UUID,
    payload: JoinTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    client_ip = get_client_ip(request)
    ip_hash = hash_ip(client_ip)

    # Secret-guessing surface: hard rate limit per IP (fail-closed).
    rate_key = f"ratelimit:ip:{ip_hash}:join"
    try:
        await _enforce_rate_limit(
            rate_key,
            settings.RATE_LIMIT_JOIN_PER_MINUTE,
            60,
            "Too many join attempts. Please wait before trying again.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Redis join rate limiting unavailable: {e}")
        raise HTTPException(status_code=503, detail="Secure join verification temporarily unavailable")

    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if now_utc() > ensure_aware(room.expires_at) or room.status == "expired":
        if room.status != "expired":
            room.status = "expired"
            await db.commit()
        raise HTTPException(status_code=410, detail="Room has expired")

    if room.status == "destroyed":
        raise HTTPException(status_code=410, detail="Room has been destroyed")

    if not safe_secret_compare(room.secret_hash, hash_room_secret(payload.room_secret)):
        raise HTTPException(status_code=403, detail="Invalid room secret key")

    # Optimistic capacity pre-check. Authoritative slot accounting happens
    # atomically at WebSocket accept and is released on disconnect.
    if manager.get_participant_count(str(room_id)) >= room.max_participants:
        raise HTTPException(
            status_code=409,
            detail=f"Room is full (maximum {room.max_participants} participants reached)",
        )

    token = generate_join_token()
    token_key = f"room:{room_id}:token:{token}"
    try:
        await redis_client.set(token_key, "valid", ex=120)  # 2 minutes valid
    except Exception as e:
        logger.error(f"Failed to store join token in Redis: {e}")
        raise HTTPException(status_code=503, detail="Could not issue join token")

    return JoinTokenResponse(token=token, expires_in_seconds=120)

@router.post("/{room_id}/destroy")
async def destroy_room(
    room_id: uuid.UUID,
    payload: RoomDestroyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    client_ip = get_client_ip(request)
    ip_hash = hash_ip(client_ip)
    rate_key = f"ratelimit:ip:{ip_hash}:destroy"
    try:
        await _enforce_rate_limit(
            rate_key,
            settings.RATE_LIMIT_DESTROY_PER_HOUR,
            3600,
            "Too many destroy requests. Please wait.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Redis rate limiting error (falling back): {e}")

    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if not safe_secret_compare(room.secret_hash, hash_room_secret(payload.room_secret)):
        raise HTTPException(status_code=403, detail="Invalid room secret key")

    room.status = "destroyed"
    room.destroyed_at = now_utc()
    await db.commit()

    await manager.close_room_connections(str(room_id), code=1000, reason="Room destroyed by participant")

    try:
        await redis_client.delete(f"room:{room_id}:slots")
    except Exception as e:
        logger.warning(f"Redis cleanup error on room destroy: {e}")

    logger.info(f"Room {room_id} has been destroyed.")
    return {"status": "destroyed", "room_id": str(room_id)}
