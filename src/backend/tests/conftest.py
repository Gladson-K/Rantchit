import os
import sys
import asyncio
import socket

# Environment MUST be configured before importing the app (settings + engine are import-time).
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{os.environ.get('RANTCHIT_TEST_DB', '/tmp/opencode/rantchit_test.db')}"
os.environ["SECRET_KEY"] = "unit-test-secret-key-not-for-production"
os.environ["ENABLE_DOCS"] = "true"
os.environ["TRUST_PROXY_HEADERS"] = "false"
os.environ["LOG_LEVEL"] = "WARNING"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import pytest_asyncio
import fakeredis.aioredis
import uvicorn

from app.main import app
from app import database
from app import models  # noqa: F401 — register metadata
from app import endpoints


@pytest_asyncio.fixture
async def stack():
    """Fresh fakeredis + clean DB tables + live uvicorn server on an ephemeral port."""
    fake = fakeredis.aioredis.FakeRedis(decode_responses=True)
    endpoints.rooms.redis_client = fake
    endpoints.ws.redis_client = fake
    endpoints.health.redis_client = fake

    async with database.engine.begin() as conn:
        await conn.run_sync(database.Base.metadata.drop_all)
        await conn.run_sync(database.Base.metadata.create_all)

    config = uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning", lifespan="on")
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    try:
        deadline = asyncio.get_event_loop().time() + 10
        while not server.started:
            if asyncio.get_event_loop().time() > deadline:
                raise RuntimeError("uvicorn failed to start")
            await asyncio.sleep(0.01)
        port = None
        while port is None:
            servers = getattr(server, "servers", None) or []
            if servers and servers[0].sockets:
                port = servers[0].sockets[0].getsockname()[1]
            else:
                await asyncio.sleep(0.01)
        yield {"base_url": f"http://127.0.0.1:{port}", "ws_url": f"ws://127.0.0.1:{port}", "redis": fake}
    finally:
        server.should_exit = True
        try:
            await asyncio.wait_for(task, 5)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            task.cancel()
            try:
                await task
            except Exception:
                pass
        try:
            await fake.flushall()
        except Exception:
            pass


def free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port
