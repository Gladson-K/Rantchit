from pydantic_settings import BaseSettings
from typing import List, Union
from pydantic import field_validator

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://rantchit:change_me@postgres:5432/rantchit"
    REDIS_URL: str = "redis://redis:6379/0"
    SECRET_KEY: str = "change_me_to_a_random_64_byte_string_for_security_production"
    ALLOWED_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://localhost:80",
        "http://localhost:3000",
        "http://localhost",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
        "http://127.0.0.1",
        "https://app.rantchit.example",
        "https://app.veilchat.example"
    ]
    ROOM_DEFAULT_TTL_MINUTES: int = 60
    ROOM_MAX_TTL_MINUTES: int = 1440
    MESSAGE_MAX_BYTES: int = 16384
    RATE_LIMIT_CREATE_PER_HOUR: int = 100
    RATE_LIMIT_MESSAGES_PER_MINUTE: int = 120
    WS_HEARTBEAT_SECONDS: int = 30
    LOG_LEVEL: str = "INFO"

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.strip().startswith("[") and v.strip().endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        return v

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()