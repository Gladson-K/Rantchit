from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .endpoints import rooms, ws
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

app = FastAPI(title="VeilChat API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms.router)
app.include_router(ws.router)

@app.get("/health")
async def health():
    return {"status": "ok"}