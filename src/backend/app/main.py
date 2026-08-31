from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging

from .config import settings
from .database import init_db
from .endpoints import rooms, ws, health

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("rantchit.main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Rantchit Backend Server...")
    await init_db()
    yield
    logger.info("Shutting down Rantchit Backend Server...")

app = FastAPI(
    title="Rantchit API",
    description="Privacy-preserving, zero-knowledge ephemeral 1-on-1 chat relay API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
origins = settings.ALLOWED_ORIGINS if isinstance(settings.ALLOWED_ORIGINS, list) else [settings.ALLOWED_ORIGINS]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if "*" not in origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(rooms.router)
app.include_router(ws.router)

@app.get("/")
async def root():
    return {
        "service": "Rantchit API",
        "version": "1.0.0",
        "description": "Zero-knowledge ephemeral chat relay service",
        "status": "operational"
    }