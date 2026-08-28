from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://veilchat:veilchat@postgres:5432/veilchat"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "change_me_to_a_random_64_byte_string"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:5173", "https://app.veilchat.example"]
    ROOM_DEFAULT_TTL_MINUTES: int = 60
    ROOM_MAX_TTL_MINUTES: int = 1440
    MESSAGE_MAX_BYTES: int = 16384
    RATE_LIMIT_CREATE_PER_HOUR: int = 10
    RATE_LIMIT_MESSAGES_PER_MINUTE: int = 30
    WS_HEARTBEAT_SECONDS: int = 30

    class Config:
        env_file = ".env"

settings = Settings()