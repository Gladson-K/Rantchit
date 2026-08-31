import logging
from ..redis_client import redis_client
from ..security import hash_ip

logger = logging.getLogger("rantchit.rate_limit")

async def check_rate_limit(key: str, limit: int, window_seconds: int) -> bool:
    """Returns True if request is within rate limit, False if exceeded."""
    try:
        current = await redis_client.incr(key)
        if current == 1:
            await redis_client.expire(key, window_seconds)
        return current <= limit
    except Exception as e:
        logger.warning(f"Rate limit check failed (failing open): {e}")
        return True
