import hashlib
import hmac
import secrets
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse
from fastapi import Request
from .config import settings

def hash_room_secret(secret: str) -> str:
    """Calculates SHA-256 hex digest of the room secret."""
    return hashlib.sha256(secret.strip().encode()).hexdigest()

def safe_secret_compare(a: str, b: str) -> bool:
    """Constant-time string comparison to prevent timing side channels."""
    return hmac.compare_digest(a, b)

def generate_join_token() -> str:
    """Generates a high-entropy 256-bit URL-safe random token."""
    return secrets.token_urlsafe(32)

def hash_ip(ip: str) -> str:
    """Calculates HMAC-SHA256 of IP address using the secret key."""
    return hmac.new(settings.SECRET_KEY.encode(), (ip or "127.0.0.1").encode(), hashlib.sha256).hexdigest()

def get_client_ip(request: Request) -> str:
    """
    Resolves the real client IP. X-Forwarded-For is only honored when
    TRUST_PROXY_HEADERS is enabled (i.e. the app runs behind its own
    nginx/Caddy edge); otherwise the direct peer address is used so
    rate-limit buckets cannot be spoofed by client-supplied headers.
    """
    if settings.TRUST_PROXY_HEADERS:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            # Leftmost entry is the original client
            return xff.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

def is_allowed_ws_origin(origin: Optional[str]) -> bool:
    """
    Exact-match WebSocket Origin validation (rejects substring bypasses
    such as http://localhost.evil.com).
    """
    if origin is None or origin == "":
        return settings.WS_ALLOW_MISSING_ORIGIN
    if origin == "null":
        return False
    allowed = settings.ALLOWED_ORIGINS if isinstance(settings.ALLOWED_ORIGINS, list) else [settings.ALLOWED_ORIGINS]
    if "*" in allowed:
        return True
    if origin in allowed:
        return True
    if settings.WS_ALLOW_LOCALHOST_ORIGIN:
        try:
            parsed = urlparse(origin)
            if parsed.scheme in ("http", "https") and parsed.hostname in ("localhost", "127.0.0.1", "::1"):
                return True
        except Exception:
            return False
    return False

def is_valid_p256_uncompressed_b64(value: str) -> bool:
    """Checks a base64url string decodes to a 65-byte uncompressed P-256 point."""
    if not isinstance(value, str) or not (80 <= len(value) <= 100):
        return False
    try:
        import base64
        s = value.replace("-", "+").replace("_", "/")
        padded = s + "=" * (-len(s) % 4)
        raw = base64.b64decode(padded, validate=True)
    except Exception:
        return False
    return len(raw) == 65 and raw[0] == 0x04

def now_utc() -> datetime:
    """Returns current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)

def ensure_aware(dt: Optional[datetime]) -> datetime:
    """Normalizes naive datetimes (e.g. SQLite round-trips) to UTC-aware."""
    if dt is None:
        return now_utc()
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt
