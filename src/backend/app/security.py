import hashlib
import hmac
import secrets
import base64
from datetime import datetime, timedelta, timezone
from .config import settings

def hash_room_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()

def generate_join_token() -> str:
    return secrets.token_urlsafe(32)

def hash_ip(ip: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), ip.encode(), hashlib.sha256).hexdigest()

def now_utc() -> datetime:
    return datetime.now(timezone.utc)