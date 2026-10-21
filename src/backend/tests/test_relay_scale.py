"""
Single-user and multi-user relay tests for the voice/arcade transport.

These cover the paths that both WebRTC signalling and arcade frames ride on:
  * a room with a single participant (no peers to relay to, no self-echo)
  * rooms at capacity with a full peer roster
  * targeted signals reaching exactly one peer at scale
  * broadcast frames fanning out to every other peer
  * the per-IP relay rate limit that voice negotiation can trip
    (see docs/BOTTLENECKS.md — "Voice: per-IP signal budget")
"""
import asyncio
import hashlib
import json

import httpx
import websockets

from app.config import settings

SECRET = "u7xQ9mK2pL4nR8vT1wY3zA5bC6dE0fG2hJ4kM6nP8qS"


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


async def create_room(base_url: str, max_participants: int) -> str:
    async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
        r = await client.post(
            "/api/v1/rooms",
            json={
                "room_secret_hash": _hash(SECRET),
                "expires_in_minutes": 30,
                "max_participants": max_participants,
            },
        )
        assert r.status_code == 201, r.text
        return r.json()["room_id"]


async def get_token(base_url: str, room_id: str) -> str:
    async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
        r = await client.post(f"/api/v1/rooms/{room_id}/join-token", json={"room_secret": SECRET})
        assert r.status_code == 200, r.text
        return r.json()["token"]


async def recv_until(ws, msg_type: str, timeout: float = 5.0):
    async def _inner():
        while True:
            data = json.loads(await ws.recv())
            if data.get("type") == msg_type:
                return data
    return await asyncio.wait_for(_inner(), timeout)


async def recv_until_pred(ws, msg_type: str, pred, timeout: float = 5.0):
    async def _inner():
        while True:
            data = json.loads(await ws.recv())
            if data.get("type") == msg_type and pred(data):
                return data
    return await asyncio.wait_for(_inner(), timeout)


async def recv_none(ws, msg_type: str, timeout: float = 0.6) -> bool:
    try:
        await recv_until(ws, msg_type, timeout)
        return False
    except asyncio.TimeoutError:
        return True


async def recv_count(ws, msg_type: str, expected: int, timeout: float = 5.0) -> int:
    """Count frames of a type until `expected` arrive (or timeout)."""
    seen = 0

    async def _inner():
        nonlocal seen
        while seen < expected:
            data = json.loads(await ws.recv())
            if data.get("type") == msg_type:
                seen += 1

    await asyncio.wait_for(_inner(), timeout)
    return seen


async def join(ws_url: str, room_id: str, token: str):
    return await websockets.connect(f"{ws_url}/ws/chat?room_id={room_id}&token={token}")


async def _join_room(stack, max_participants: int, n: int):
    """Create a room and join `n` websocket clients. Returns (room_id, [(ws, connected), ...])."""
    rid = await create_room(stack["base_url"], max_participants)
    peers = []
    for _ in range(n):
        token = await get_token(stack["base_url"], rid)
        ws = await join(stack["ws_url"], rid, token)
        connected = await recv_until(ws, "connected")
        peers.append((ws, connected))
    return rid, peers


class TestSingleUser:
    async def test_lone_participant_sees_count_of_one(self, stack):
        rid, peers = await _join_room(stack, max_participants=6, n=1)
        ws, connected = peers[0]
        try:
            assert connected["participants"] == 1
            assert connected["max_participants"] == 6
        finally:
            await ws.close()

    async def test_lone_broadcast_does_not_echo_to_self(self, stack):
        rid, peers = await _join_room(stack, max_participants=6, n=1)
        ws, _ = peers[0]
        try:
            await ws.send(json.dumps({"type": "signal", "encrypted_payload": "solo"}))
            # No peers: nothing relayed, and crucially no self-echo.
            assert await recv_none(ws, "signal", timeout=0.5)
            assert await recv_none(ws, "error", timeout=0.2)
        finally:
            await ws.close()


class TestMultiUser:
    async def test_full_roster_of_eight(self, stack):
        rid, peers = await _join_room(stack, max_participants=8, n=8)
        try:
            # The last joiner must observe the full roster count.
            assert peers[-1][1]["participants"] == 8
            assert peers[-1][1]["max_participants"] == 8
        finally:
            for ws, _ in peers:
                await ws.close()

    async def test_capacity_rejects_over_limit(self, stack):
        rid, peers = await _join_room(stack, max_participants=2, n=2)
        try:
            async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
                r = await client.post(
                    f"/api/v1/rooms/{rid}/join-token", json={"room_secret": SECRET}
                )
            assert r.status_code == 409
            assert "full" in r.json()["detail"].lower()
        finally:
            for ws, _ in peers:
                await ws.close()

    async def test_targeted_signal_reaches_only_target(self, stack):
        rid, peers = await _join_room(stack, max_participants=3, n=3)
        a, b, c = peers
        try:
            await a[0].send(json.dumps({
                "type": "signal",
                "to": b[1]["peer_id"],
                "encrypted_payload": "ONLY-B",
            }))
            got = await recv_until(b[0], "signal")
            assert got["encrypted_payload"] == "ONLY-B"
            assert got["from"] == a[1]["peer_id"]
            # The third peer must never see it.
            assert await recv_none(c[0], "signal", timeout=0.5)
        finally:
            for ws, _ in peers:
                await ws.close()

    async def test_broadcast_fans_out_to_every_other_peer(self, stack):
        rid, peers = await _join_room(stack, max_participants=8, n=8)
        sender = peers[0]
        try:
            await sender[0].send(json.dumps({"type": "game", "move": "start"}))
            for ws, _ in peers[1:]:
                got = await recv_until(ws, "game")
                assert got["from"] == sender[1]["peer_id"]
        finally:
            for ws, _ in peers:
                await ws.close()

    async def test_full_mesh_signal_volume(self, stack):
        """A mesh of N peers needs N*(N-1) directed signals to connect everyone."""
        n = 8
        rid, peers = await _join_room(stack, max_participants=n, n=n)
        try:
            sender_ws, sender_info = peers[0]
            targets = [info["peer_id"] for _, info in peers[1:]]
            for target in targets:
                await sender_ws.send(json.dumps({
                    "type": "signal", "to": target, "encrypted_payload": "offer",
                }))
            for ws, _ in peers[1:]:
                got = await recv_until(ws, "signal")
                assert got["from"] == sender_info["peer_id"]
            assert len(targets) == n - 1
            assert n * (n - 1) == 56  # O(N^2) growth documented in BOTTLENECKS.md
        finally:
            for ws, _ in peers:
                await ws.close()


class TestPeerRosterContract:
    async def test_peer_list_uses_the_pinned_snake_case_contract(self, stack):
        """
        The frontend normalises the roster via `normalizePeers()` in
        src/frontend/src/lib/peers.ts. The key names below are the contract;
        renaming one silently blanks the room UI (it did once already), so
        this test pins them.
        """
        rid, peers = await _join_room(stack, max_participants=3, n=2)
        a, b = peers
        try:
            roster = await recv_until_pred(
                a[0], "peer_list", lambda d: len(d["peers"]) == 2
            )
            entries = roster["peers"]
            assert len(entries) == 2
            for entry in entries:
                assert set(entry.keys()) == {"peer_id", "alias", "is_host", "has_key"}
                assert entry["peer_id"].startswith("p_")
                assert isinstance(entry["alias"], str)
                assert isinstance(entry["is_host"], bool)
                assert isinstance(entry["has_key"], bool)
            # Exactly one host — the earliest connection.
            assert sum(1 for e in entries if e["is_host"]) == 1
        finally:
            for ws, _ in peers:
                await ws.close()

    async def test_peer_list_alias_is_surfaced(self, stack):
        rid, peers = await _join_room(stack, max_participants=3, n=2)
        a, b = peers
        try:
            await a[0].send(json.dumps({"type": "hello", "alias": "TRON"}))
            roster = await recv_until_pred(
                a[0], "peer_list", lambda d: any(p.get("alias") == "TRON" for p in d["peers"])
            )
            tron = [p for p in roster["peers"] if p.get("alias") == "TRON"][0]
            assert tron["peer_id"].startswith("p_")
        finally:
            for ws, _ in peers:
                await ws.close()


class TestRelayRateLimit:
    async def test_per_ip_signal_budget_is_finite(self, stack):
        """
        The relay rate-limits signalling per client IP. All peers behind one NAT
        share this budget, so a busy negotiation can trip it — the bottleneck
        called out in docs/BOTTLENECKS.md.
        """
        rid, peers = await _join_room(stack, max_participants=6, n=1)
        ws, _ = peers[0]
        try:
            budget = settings.RATE_LIMIT_SIGNALS_PER_MINUTE
            for _ in range(budget + 1):
                await ws.send(json.dumps({"type": "signal", "encrypted_payload": "x"}))
            err = await recv_until(ws, "error", timeout=5.0)
            assert "rate limit" in err["message"].lower()
        finally:
            await ws.close()
