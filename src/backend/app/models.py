from sqlalchemy import Column, String, DateTime, SmallInteger, func, Uuid
import uuid
from .database import Base

class Room(Base):
    __tablename__ = "rooms"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    secret_hash = Column(String(64), nullable=False)  # SHA-256 hex of room secret
    status = Column(String(16), default="active", nullable=False)     # active, destroyed, expired
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    destroyed_at = Column(DateTime(timezone=True), nullable=True)
    max_participants = Column(SmallInteger, default=2, nullable=False)
    participant_count = Column(SmallInteger, default=0, nullable=False)
    ip_hash = Column(String(64), nullable=False)  # HMAC of creator IP