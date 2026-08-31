from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional

class RoomCreate(BaseModel):
    room_secret_hash: str = Field(..., min_length=64, max_length=64, description="SHA-256 hex of the room secret")
    expires_in_minutes: int = Field(default=60, ge=1, le=1440, description="Expiration time in minutes (1 to 1440)")

class RoomResponse(BaseModel):
    room_id: UUID
    expires_at: datetime
    max_participants: int = 2
    status: str = "active"

class RoomInfoResponse(BaseModel):
    room_id: UUID
    status: str
    created_at: datetime
    expires_at: datetime
    max_participants: int = 2
    participant_count: int = 0
    is_expired: bool = False

class JoinTokenRequest(BaseModel):
    room_secret: str = Field(..., min_length=32, max_length=128, description="Actual room secret sent over TLS")

class JoinTokenResponse(BaseModel):
    token: str
    expires_in_seconds: int

class RoomDestroyRequest(BaseModel):
    room_secret: str = Field(..., min_length=32, max_length=128, description="Room secret required to authorize destruction")

class HealthResponse(BaseModel):
    status: str
    postgres: str
    redis: str
    timestamp: datetime