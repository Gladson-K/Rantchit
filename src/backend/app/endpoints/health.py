from fastapi import APIRouter
from sqlalchemy import text
from datetime import datetime, timezone
from ..database import async_session
from ..redis_client import redis_client
from ..schemas import HealthResponse

router = APIRouter(tags=["health"])

@router.get("/health", response_model=HealthResponse)
@router.get("/api/v1/health", response_model=HealthResponse)
async def health_check():
    pg_status = "healthy"
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
    except Exception as e:
        pg_status = f"unhealthy: {str(e)}"

    redis_status = "healthy"
    try:
        await redis_client.ping()
    except Exception as e:
        redis_status = f"unhealthy: {str(e)}"

    overall = "ok" if pg_status == "healthy" and redis_status == "healthy" else "degraded"
    return HealthResponse(
        status=overall,
        postgres=pg_status,
        redis=redis_status,
        timestamp=datetime.now(timezone.utc)
    )
