from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import uuid
from datetime import timedelta
import redis.asyncio as redis

from ..database import async_session
from ..models import Room
from ..schemas import RoomCreate, RoomResponse, JoinTokenRequest, JoinTokenResponse
from ..security import hash_room_secret, generate_join_token, hash_ip, now_utc
from ..config import settings
from ..redis_client import redis_client

router = APIRouter(prefix="/api/v1/rooms", tags=["rooms"])

async def get_db():
    async with async_session() as session:
        yield session

@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: RoomCreate,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    # Rate limit by IP
    ip = request.client.host
    ip_hash = hash_ip(ip)
    rate_key = f"ratelimit:ip:{ip_hash}:create"
    current = await redis_client.get(rate_key)
    if current and int(current) >= settings.RATE_LIMIT_CREATE_PER_HOUR:
        raise HTTPException(status_code=429, detail="Too many rooms created. Try again later.")
    pipe = redis_client.pipeline()
    pipe.incr(rate_key)
    pipe.expire(rate_key, 3600)
    await pipe.execute()

    # Create room
    expires_in = min(payload.expires_in_minutes, settings.ROOM_MAX_TTL_MINUTES)
    expires_at = now_utc() + timedelta(minutes=expires_in)
    room = Room(
        id=uuid.uuid4(),
        secret_hash=payload.room_secret_hash,
        expires_at=expires_at,
        ip_hash=ip_hash,
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    return RoomResponse(room_id=room.id, expires_at=room.expires_at, max_participants=2)

@router.post("/{room_id}/join-token", response_model=JoinTokenResponse)
async def get_join_token(
    room_id: uuid.UUID,
    payload: JoinTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    # Validate room exists and secret matches
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room or room.status != "active":
        raise HTTPException(status_code=404, detail="Room not found or expired")
    if room.secret_hash != hash_room_secret(payload.room_secret):
        raise HTTPException(status_code=403, detail="Invalid room secret")

    # Check slot availability atomically in Redis
    slot_key = f"room:{room_id}:slots"
    current = await redis_client.incr(slot_key)
    if current > 2:
        await redis_client.decr(slot_key)  # rollback
        raise HTTPException(status_code=409, detail="Room is full")
    await redis_client.expire(slot_key, int((room.expires_at - now_utc()).total_seconds()))

    # Generate one-time token
    token = generate_join_token()
    token_key = f"room:{room_id}:token:{token}"
    await redis_client.set(token_key, "valid", ex=120)  # 2 minutes expiry
    return JoinTokenResponse(token=token, expires_in_seconds=120)