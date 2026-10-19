from fastapi import FastAPI, Request
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
    lifespan=lifespan,
    docs_url="/docs" if settings.ENABLE_DOCS else None,
    redoc_url="/redoc" if settings.ENABLE_DOCS else None,
    openapi_url="/openapi.json" if settings.ENABLE_DOCS else None,
)

# CORS setup. Wildcard + credentials is rejected by browsers and is never sent together.
origins = settings.ALLOWED_ORIGINS if isinstance(settings.ALLOWED_ORIGINS, list) else [settings.ALLOWED_ORIGINS]
wildcard = "*" in origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if not wildcard else ["*"],
    allow_credentials=not wildcard,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
    if request.url.scheme == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    content_type = response.headers.get("content-type", "")
    if content_type.startswith("text/html"):
        response.headers.setdefault("Content-Security-Policy", settings.CONTENT_SECURITY_POLICY)
    return response

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
