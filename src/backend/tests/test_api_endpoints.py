"""REST endpoint tests against a live uvicorn server (SQLite + fakeredis)."""
import hashlib

import httpx
import pytest


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


SECRET = "u7xQ9mK2pL4nR8vT1wY3zA5bC6dE0fG2hJ4kM6nP8qS"


async def _create_room(client: httpx.AsyncClient, secret: str = SECRET, minutes: int = 60) -> dict:
    r = await client.post("/api/v1/rooms", json={"room_secret_hash": _hash(secret), "expires_in_minutes": minutes})
    assert r.status_code == 201, r.text
    return r.json()


class TestRoomLifecycle:
    async def test_create_and_get_info(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            room = await _create_room(client)
            assert "room_id" in room and room["status"] == "active"

            info = await client.get(f"/api/v1/rooms/{room['room_id']}")
            assert info.status_code == 200
            body = info.json()
            assert body["status"] == "active"
            assert body["is_expired"] is False

    async def test_create_rejects_non_hex_hash(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            r = await client.post("/api/v1/rooms", json={"room_secret_hash": "Z" * 64, "expires_in_minutes": 60})
            assert r.status_code == 422

    async def test_create_rejects_uppercase_hash(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            r = await client.post("/api/v1/rooms", json={"room_secret_hash": _hash(SECRET).upper(), "expires_in_minutes": 60})
            assert r.status_code == 422

    async def test_join_token_wrong_secret_403(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            room = await _create_room(client)
            r = await client.post(
                f"/api/v1/rooms/{room['room_id']}/join-token",
                json={"room_secret": "w" * 43},
            )
            assert r.status_code == 403

    async def test_join_token_correct_secret_200(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            room = await _create_room(client)
            r = await client.post(
                f"/api/v1/rooms/{room['room_id']}/join-token",
                json={"room_secret": SECRET},
            )
            assert r.status_code == 200
            body = r.json()
            assert body["expires_in_seconds"] == 120
            assert len(body["token"]) >= 40

    async def test_join_token_rate_limited_429(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            room = await _create_room(client)
            statuses = []
            for _ in range(35):
                r = await client.post(
                    f"/api/v1/rooms/{room['room_id']}/join-token",
                    json={"room_secret": "w" * 43},
                )
                statuses.append(r.status_code)
            assert 429 in statuses, f"expected a 429 within 35 wrong-secret attempts, got {statuses}"

    async def test_destroy_requires_correct_secret(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            room = await _create_room(client)
            bad = await client.post(
                f"/api/v1/rooms/{room['room_id']}/destroy",
                json={"room_secret": "x" * 43},
            )
            assert bad.status_code == 403

            good = await client.post(
                f"/api/v1/rooms/{room['room_id']}/destroy",
                json={"room_secret": SECRET},
            )
            assert good.status_code == 200
            assert good.json()["status"] == "destroyed"

            # Subsequent join attempts fail with 410
            join = await client.post(
                f"/api/v1/rooms/{room['room_id']}/join-token",
                json={"room_secret": SECRET},
            )
            assert join.status_code == 410

    async def test_expired_room_410(self, stack):
        from datetime import timedelta
        from app.database import async_session
        from app.models import Room
        from app.security import now_utc
        from sqlalchemy import select, update

        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            room = await _create_room(client)
            async with async_session() as db:
                await db.execute(
                    update(Room).where(Room.secret_hash == _hash(SECRET)).values(expires_at=now_utc() - timedelta(minutes=5))
                )
                await db.commit()

            r = await client.post(
                f"/api/v1/rooms/{room['room_id']}/join-token",
                json={"room_secret": SECRET},
            )
            assert r.status_code == 410


class TestSecurityHeaders:
    async def test_headers_present(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            r = await client.get("/health")
            assert r.headers["x-content-type-options"] == "nosniff"
            assert r.headers["x-frame-options"] == "DENY"
            assert r.headers["referrer-policy"] == "no-referrer"
            assert "permissions-policy" in r.headers

    async def test_health_does_not_leak_exceptions(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            r = await client.get("/health")
            body = r.json()
            assert "Traceback" not in str(body)
            assert "Error" not in body.get("postgres", "") or body["postgres"] == "unhealthy"


class TestHealth:
    async def test_healthy_stack(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            r = await client.get("/api/v1/health")
            assert r.status_code == 200
            body = r.json()
            assert body["status"] == "ok"
            assert body["postgres"] == "healthy"
            assert body["redis"] == "healthy"
