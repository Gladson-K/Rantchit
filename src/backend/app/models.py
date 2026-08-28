from sqlalchemy import Column, String, DateTime, SmallInteger, func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from .database import Base

class Room(Base):
    __tablename__ = "rooms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    secret_hash = Column(String(64), nullable=False)  # SHA-256 hex of room secret
    status = Column(String(16), default="active")     # active, destroyed, expired
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    destroyed_at = Column(DateTime(timezone=True), nullable=True)
    max_participants = Column(SmallInteger, default=2)
    participant_count = Column(SmallInteger, default=0)
    ip_hash = Column(String(64), nullable=False)  # HMAC of creator IP