"""
Relay-extension tests: the server forwards opaque WebRTC-signalling and
arcade-move frames without inspecting them, supports targeted routing via a
`to` peer id, broadcasts when no target is given, and enforces size/rate caps.
"""
import asyncio
import hashlib
import json

import httpx
import websockets

SECRET = "u7xQ9mK2pL4nR8vT1wY3zA5bC6dE0fG2hJ4kM6nP8qS"


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


async def create_room(base_url: str, max_participants: int = 2) -> str:
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
    """Returns True if no frame of the given type arrives within the window."""
    try:
        await recv_until(ws, msg_type, timeout)
        return False
    except asyncio.TimeoutError:
        return True


async def join_ws(ws_url: str, room_id: str, token: str):
    return await websockets.connect(f"{ws_url}/ws/chat?room_id={room_id}&token={token}")


async def _pair(stack, max_participants: int = 3):
    rid = await create_room(stack["base_url"], max_participants)
    tok_a = await get_token(stack["base_url"], rid)
    tok_b = await get_token(stack["base_url"], rid)
    ws_a = await join_ws(stack["ws_url"], rid, tok_a)
    c_a = await recv_until(ws_a, "connected")
    ws_b = await join_ws(stack["ws_url"], rid, tok_b)
    c_b = await recv_until(ws_b, "connected")
    return rid, ws_a, c_a, ws_b, c_b


class TestOpaqueRelay:
    async def test_targeted_signal_reaches_only_target(self, stack):
        rid, ws_a, c_a, ws_b, c_b = await _pair(stack)
        try:
            payload = {"type": "signal", "to": c_b["peer_id"], "encrypted_payload": "AAAA", "nonce": "BBBB"}
            await ws_a.send(json.dumps(payload))
            got = await recv_until(ws_b, "signal")
            assert got["encrypted_payload"] == "AAAA"
            assert got["from"] == c_a["peer_id"]
        finally:
            await ws_a.close()
            await ws_b.close()

    async def test_broadcast_game_frame_when_no_target(self, stack):
        rid, ws_a, c_a, ws_b, c_b = await _pair(stack)
        try:
            await ws_a.send(json.dumps({"type": "game", "game": "tictactoe", "move": 4, "encrypted_payload": "ZZ"}))
            got = await recv_until(ws_b, "game")
            assert got.get("game") == "tictactoe"
            assert got["from"] == c_a["peer_id"]
        finally:
            await ws_a.close()
            await ws_b.close()

    async def test_signal_to_unknown_peer_errors(self, stack):
        rid, ws_a, c_a, ws_b, c_b = await _pair(stack)
        try:
            await ws_a.send(json.dumps({"type": "signal", "to": "p_deadbeef", "encrypted_payload": "x"}))
            err = await recv_until(ws_a, "error")
            assert "no longer connected" in err["message"].lower()
        finally:
            await ws_a.close()
            await ws_b.close()

    async def test_oversized_signal_rejected(self, stack):
        rid, ws_a, c_a, ws_b, c_b = await _pair(stack)
        try:
            await ws_a.send(json.dumps({"type": "signal", "encrypted_payload": "A" * 40000}))
            err = await recv_until(ws_a, "error")
            assert "exceeds maximum" in err["message"].lower()
        finally:
            await ws_a.close()
            await ws_b.close()

    async def test_hello_alias_surfaces_in_roster(self, stack):
        rid, ws_a, c_a, ws_b, c_b = await _pair(stack)
        try:
            await ws_a.send(json.dumps({"type": "hello", "alias": "TRON"}))
            roster = await recv_until_pred(
                ws_b, "peer_list", lambda d: any(p["alias"] == "TRON" for p in d["peers"])
            )
            assert any(p["alias"] == "TRON" for p in roster["peers"])
        finally:
            await ws_a.close()
            await ws_b.close()

    async def test_invalid_alias_ignored(self, stack):
        rid, ws_a, c_a, ws_b, c_b = await _pair(stack)
        try:
            # Drain the join-time roster first.
            await recv_until(ws_b, "peer_list")
            await ws_a.send(json.dumps({"type": "hello", "alias": "x" * 200}))
            assert await recv_none(ws_b, "peer_list", timeout=0.5)
        finally:
            await ws_a.close()
            await ws_b.close()
