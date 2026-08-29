from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID

class RoomCreate(BaseModel):
    room_secret_hash: str = Field(..., min_length=64, max_length=64)  # SHA-256 hex
    expires_in_minutes: int = Field(default=60, ge=1, le=1440)

class RoomResponse(BaseModel):
    room_id: UUID
    expires_at: datetime
    max_participants: int = 2

class JoinTokenRequest(BaseModel):
    room_secret: str = Field(..., min_length=32, max_length=64)  # actual secret sent over TLS

class JoinTokenResponse(BaseModel):
    token: str
    expires_in_seconds: int