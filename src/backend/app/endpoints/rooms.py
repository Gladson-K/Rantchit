from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
import uuid
from datetime import timedelta
import logging

from ..database import async_session
from ..models import Room
from ..schemas import RoomCreate, RoomResponse, RoomInfoResponse, JoinTokenRequest, JoinTokenResponse, RoomDestroyRequest
from ..security import hash_room_secret, generate_join_token, hash_ip, now_utc
from ..config import settings
from ..redis_client import redis_client
from ..websocket_manager import manager

logger = logging.getLogger("rantchit.rooms")
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
    client_ip = request.client.host if request.client else "127.0.0.1"
    ip_hash = hash_ip(client_ip)
    rate_key = f"ratelimit:ip:{ip_hash}:create"
    
    try:
        current = await redis_client.get(rate_key)
        if current and int(current) >= settings.RATE_LIMIT_CREATE_PER_HOUR:
            raise HTTPException(status_code=429, detail="Too many rooms created. Please wait before creating another.")
        pipe = redis_client.pipeline()
        pipe.incr(rate_key)
        pipe.expire(rate_key, 3600)
        await pipe.execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Redis rate limiting error (falling back): {e}")

    # Calculate expiration
    expires_in = min(payload.expires_in_minutes, settings.ROOM_MAX_TTL_MINUTES)
    expires_at = now_utc() + timedelta(minutes=expires_in)
    
    room = Room(
        id=uuid.uuid4(),
        secret_hash=payload.room_secret_hash,
        status="active",
        expires_at=expires_at,
        max_participants=2,
        participant_count=0,
        ip_hash=ip_hash,
    )
    db.add(room)
    await db.commit()
    await db.refresh(room)
    
    logger.info(f"Room created: {room.id}, expires at {room.expires_at}")
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
    if now_utc() > room.expires_at and room.status == "active":
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
    # Validate room exists and is active
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if now_utc() > room.expires_at or room.status == "expired":
        if room.status != "expired":
            room.status = "expired"
            await db.commit()
        raise HTTPException(status_code=410, detail="Room has expired")
        
    if room.status == "destroyed":
        raise HTTPException(status_code=410, detail="Room has been destroyed")
        
    if room.secret_hash != hash_room_secret(payload.room_secret):
        raise HTTPException(status_code=403, detail="Invalid room secret key")

    # Check slot availability atomically in Redis
    slot_key = f"room:{room_id}:slots"
    try:
        current = await redis_client.incr(slot_key)
        if current > 2:
            await redis_client.decr(slot_key)  # Rollback
            raise HTTPException(status_code=409, detail="Room is full (maximum 2 participants reached)")
        
        ttl_seconds = max(10, int((room.expires_at - now_utc()).total_seconds()))
        await redis_client.expire(slot_key, ttl_seconds)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Redis slot claim error: {e}")

    # Generate single-use join token
    token = generate_join_token()
    token_key = f"room:{room_id}:token:{token}"
    try:
        await redis_client.set(token_key, "valid", ex=120)  # 2 minutes valid
    except Exception as e:
        logger.error(f"Failed to store join token in Redis: {e}")
        
    return JoinTokenResponse(token=token, expires_in_seconds=120)

@router.post("/{room_id}/destroy")
async def destroy_room(
    room_id: uuid.UUID,
    payload: RoomDestroyRequest,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Room).where(Room.id == room_id))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
        
    if room.secret_hash != hash_room_secret(payload.room_secret):
        raise HTTPException(status_code=403, detail="Invalid room secret key")
        
    room.status = "destroyed"
    room.destroyed_at = now_utc()
    await db.commit()
    
    # Notify sockets and close
    await manager.close_room_connections(str(room_id), code=1000, reason="Room destroyed by participant")
    
    # Clean up Redis keys
    try:
        keys_to_delete = [
            f"room:{room_id}:slots",
            f"room:{room_id}:peer_pubkey",
            f"room:{room_id}:creator_pubkey",
        ]
        for key in keys_to_delete:
            await redis_client.delete(key)
    except Exception as e:
        logger.warning(f"Redis cleanup error on room destroy: {e}")
        
    logger.info(f"Room {room_id} has been destroyed.")
    return {"status": "destroyed", "room_id": str(room_id)}