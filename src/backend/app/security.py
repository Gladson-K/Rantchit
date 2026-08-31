import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from .config import settings

def hash_room_secret(secret: str) -> str:
    """Calculates SHA-256 hex digest of the room secret."""
    return hashlib.sha256(secret.strip().encode()).hexdigest()

def generate_join_token() -> str:
    """Generates a high-entropy 256-bit URL-safe random token."""
    return secrets.token_urlsafe(32)

def hash_ip(ip: str) -> str:
    """Calculates HMAC-SHA256 of IP address using the secret key."""
    return hmac.new(settings.SECRET_KEY.encode(), (ip or "127.0.0.1").encode(), hashlib.sha256).hexdigest()

def now_utc() -> datetime:
    """Returns current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)