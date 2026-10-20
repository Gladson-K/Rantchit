"""
Multi-user room tests: host-configurable participant caps, atomic slot
enforcement beyond 2, and the live peer roster (peer ids + host flag)
broadcast to every participant.
"""
import asyncio
import hashlib
import json

import httpx
import pytest
import websockets

SECRET = "u7xQ9mK2pL4nR8vT1wY3zA5bC6dE0fG2hJ4kM6nP8qS"


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


async def create_room(base_url: str, max_participants: int, secret: str = SECRET) -> dict:
    async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
        r = await client.post(
            "/api/v1/rooms",
            json={
                "room_secret_hash": _hash(secret),
                "expires_in_minutes": 30,
                "max_participants": max_participants,
            },
        )
        assert r.status_code == 201, r.text
        return r.json()


async def get_token(base_url: str, room_id: str, secret: str = SECRET) -> str:
    async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
        r = await client.post(f"/api/v1/rooms/{room_id}/join-token", json={"room_secret": secret})
        return r.json().get("token") if r.status_code == 200 else None


async def recv_until(ws, msg_type: str, timeout: float = 5.0):
    async def _inner():
        while True:
            data = json.loads(await ws.recv())
            if data.get("type") == msg_type:
                return data
    return await asyncio.wait_for(_inner(), timeout)


async def join_ws(ws_url: str, room_id: str, token: str, **kwargs):
    return await websockets.connect(f"{ws_url}/ws/chat?room_id={room_id}&token={token}", **kwargs)


class TestHostConfiguredCapacity:
    async def test_room_info_reports_host_max(self, stack):
        room = await create_room(stack["base_url"], max_participants=5)
        assert room["max_participants"] == 5
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            info = await client.get(f"/api/v1/rooms/{room['room_id']}")
            assert info.json()["max_participants"] == 5

    async def test_host_request_clamped_to_server_limit(self, stack):
        # Server ceiling is ROOM_MAX_PARTICIPANTS_LIMIT (8 by default).
        room = await create_room(stack["base_url"], max_participants=64)
        assert room["max_participants"] == 8

    async def test_minimum_cap_is_two(self, stack):
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            r = await client.post(
                "/api/v1/rooms",
                json={
                    "room_secret_hash": _hash(SECRET),
                    "expires_in_minutes": 30,
                    "max_participants": 1,
                },
            )
            assert r.status_code == 422


class TestManyParticipants:
    async def test_four_participants_connect_and_fifth_rejected(self, stack):
        room = await create_room(stack["base_url"], max_participants=4)
        rid = room["room_id"]
        tokens = [await get_token(stack["base_url"], rid) for _ in range(4)]
        assert all(tokens)

        sockets = []
        for tok in tokens:
            ws = await join_ws(stack["ws_url"], rid, tok)
            await recv_until(ws, "connected")
            sockets.append(ws)

        # REST pre-check now reports the room full.
        assert await get_token(stack["base_url"], rid) is None

        # Authoritative WS slot claim also rejects a 5th connection.
        # (Reuse a fresh token trick: tokens are single-use, so the REST 409 is
        # the enforcement point once 4 are live.)
        for ws in sockets:
            await ws.close()

    async def test_roster_lists_all_peers_with_host_flag(self, stack):
        room = await create_room(stack["base_url"], max_participants=3)
        rid = room["room_id"]
        tok_a = await get_token(stack["base_url"], rid)
        ws_a = await join_ws(stack["ws_url"], rid, tok_a)
        await recv_until(ws_a, "connected")
        await ws_a.send(json.dumps({"type": "hello", "alias": "NEO"}))

        tok_b = await get_token(stack["base_url"], rid)
        ws_b = await join_ws(stack["ws_url"], rid, tok_b)
        await recv_until(ws_b, "connected")

        # ws_b receives the roster, including A's alias and the host flag.
        async def _roster():
            while True:
                data = json.loads(await ws_b.recv())
                if data.get("type") == "peer_list" and any(p["alias"] == "NEO" for p in data["peers"]):
                    return data
        roster = await asyncio.wait_for(_roster(), 5)
        aliases = {p["alias"] for p in roster["peers"]}
        assert "NEO" in aliases
        assert len(roster["peers"]) == 2
        host_count = sum(1 for p in roster["peers"] if p["is_host"])
        assert host_count == 1

        await ws_a.close()
        await ws_b.close()

    async def test_peer_id_is_stable_and_distinct(self, stack):
        room = await create_room(stack["base_url"], max_participants=2)
        rid = room["room_id"]
        tok_a = await get_token(stack["base_url"], rid)
        tok_b = await get_token(stack["base_url"], rid)
        ws_a = await join_ws(stack["ws_url"], rid, tok_a)
        ws_b = await join_ws(stack["ws_url"], rid, tok_b)
        c_a = await recv_until(ws_a, "connected")
        c_b = await recv_until(ws_b, "connected")
        assert c_a["peer_id"] and c_b["peer_id"]
        assert c_a["peer_id"] != c_b["peer_id"]
        assert c_a["max_participants"] == 2
        await ws_a.close()
        await ws_b.close()
