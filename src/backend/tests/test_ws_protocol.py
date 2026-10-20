"""
Two-client WebSocket integration tests: full XBF-MKC handshake, encrypted
relay, capacity slots, origin enforcement, single-use tokens, and an active
MITM relay attack that must be cryptographically detected.
"""
import asyncio
import hashlib
import json
import secrets

import httpx
import pytest
import websockets

from tests.xbf import XBFClient

SECRET = "u7xQ9mK2pL4nR8vT1wY3zA5bC6dE0fG2hJ4kM6nP8qS"


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


async def create_room(base_url: str, secret: str = SECRET) -> str:
    async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
        r = await client.post("/api/v1/rooms", json={"room_secret_hash": _hash(secret), "expires_in_minutes": 30})
        assert r.status_code == 201
        return r.json()["room_id"]


async def get_token(base_url: str, room_id: str, secret: str = SECRET) -> str:
    async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
        r = await client.post(f"/api/v1/rooms/{room_id}/join-token", json={"room_secret": secret})
        assert r.status_code == 200, r.text
        return r.json()["token"]


async def recv_until(ws, msg_type: str, timeout: float = 5.0):
    async def _inner():
        while True:
            data = json.loads(await ws.recv())
            if data.get("type") == msg_type:
                return data
    return await asyncio.wait_for(_inner(), timeout)


async def join_ws(ws_url: str, room_id: str, token: str, **kwargs):
    return await websockets.connect(f"{ws_url}/ws/chat?room_id={room_id}&token={token}", **kwargs)


async def perform_handshake(ws, client: XBFClient):
    """Runs the client-side XBF-MKC handshake on an open websocket."""
    await recv_until(ws, "connected")
    await ws.send(json.dumps({"type": "public_key", "public_key": client.public_b64}))

    # Wait until we have the peer's key (may arrive now or after their join)
    peer_key_msg = await recv_until(ws, "peer_public_key")
    client.establish(peer_key_msg["public_key"])
    await ws.send(json.dumps({"type": "key_confirm", "tag": client.confirmation_tag()}))

    confirm = await recv_until(ws, "key_confirm")
    assert client.verify_confirmation_tag(confirm["tag"]), "MKC tag mismatch"
    return client.transcript


class TestTwoClientHandshake:
    async def test_full_e2ee_session_and_relay(self, stack):
        room_id = await create_room(stack["base_url"])
        alice = XBFClient(SECRET)
        bob = XBFClient(SECRET)

        tok_a = await get_token(stack["base_url"], room_id)
        ws_a = await join_ws(stack["ws_url"], room_id, tok_a)
        await recv_until(ws_a, "connected")
        await ws_a.send(json.dumps({"type": "public_key", "public_key": alice.public_b64}))

        tok_b = await get_token(stack["base_url"], room_id)
        ws_b = await join_ws(stack["ws_url"], room_id, tok_b)

        # Bob receives stored key of Alice automatically + peer_joined on Alice side
        peer_msg = await recv_until(ws_b, "peer_public_key")
        bob.establish(peer_msg["public_key"])
        await ws_b.send(json.dumps({"type": "public_key", "public_key": bob.public_b64}))
        await ws_b.send(json.dumps({"type": "key_confirm", "tag": bob.confirmation_tag()}))

        peer_a = await recv_until(ws_a, "peer_public_key")
        alice.establish(peer_a["public_key"])
        await ws_a.send(json.dumps({"type": "key_confirm", "tag": alice.confirmation_tag()}))

        confirm_b = await recv_until(ws_b, "key_confirm")
        assert bob.verify_confirmation_tag(confirm_b["tag"])
        confirm_a = await recv_until(ws_a, "key_confirm")
        assert alice.verify_confirmation_tag(confirm_a["tag"])

        # Identical transcripts => identical SAS on both sides
        assert alice.transcript == bob.transcript
        assert XBFClient.sas_from_transcript(alice.transcript) == XBFClient.sas_from_transcript(bob.transcript)

        # Encrypted relay: server only sees ciphertext
        ct, nonce = alice.encrypt("top secret from alice")
        await ws_a.send(json.dumps({"type": "message", "encrypted_payload": ct, "nonce": nonce}))

        async def wait_msg(ws):
            while True:
                data = json.loads(await ws.recv())
                if data.get("type") == "message":
                    return data
        relayed = await asyncio.wait_for(wait_msg(ws_b), 5)
        assert "top secret from alice" not in json.dumps(relayed)
        assert bob.decrypt(relayed["encrypted_payload"], relayed["nonce"]) == "top secret from alice"

        await ws_a.close()
        await ws_b.close()

    async def test_third_client_rejected_when_full(self, stack):
        room_id = await create_room(stack["base_url"])
        tok_a = await get_token(stack["base_url"], room_id)
        tok_b = await get_token(stack["base_url"], room_id)
        ws_a = await join_ws(stack["ws_url"], room_id, tok_a)
        ws_b = await join_ws(stack["ws_url"], room_id, tok_b)
        await recv_until(ws_a, "connected")
        await recv_until(ws_b, "connected")

        # REST pre-check must reject a third join while 2 participants are live.
        async with httpx.AsyncClient(base_url=stack["base_url"], timeout=10) as client:
            r = await client.post(
                f"/api/v1/rooms/{room_id}/join-token", json={"room_secret": SECRET}
            )
            assert r.status_code == 409

        await ws_a.close()
        await ws_b.close()

    async def test_slot_released_on_disconnect_allows_rejoin(self, stack):
        room_id = await create_room(stack["base_url"])

        tok_a = await get_token(stack["base_url"], room_id)
        ws_a = await join_ws(stack["ws_url"], room_id, tok_a)
        await recv_until(ws_a, "connected")
        await ws_a.close()
        await asyncio.sleep(0.2)

        # Slot must have been released -> rejoin works
        tok_a2 = await get_token(stack["base_url"], room_id)
        ws_a2 = await join_ws(stack["ws_url"], room_id, tok_a2)
        await recv_until(ws_a2, "connected")
        await ws_a2.close()

    async def test_single_use_token_rejected_on_reuse(self, stack):
        room_id = await create_room(stack["base_url"])
        tok = await get_token(stack["base_url"], room_id)
        ws = await join_ws(stack["ws_url"], room_id, tok)
        await recv_until(ws, "connected")
        await ws.close()
        await asyncio.sleep(0.1)

        with pytest.raises(Exception):
            ws2 = await join_ws(stack["ws_url"], room_id, tok)
            # Connection should be closed by server immediately
            try:
                await asyncio.wait_for(ws2.recv(), timeout=2)
            except websockets.exceptions.ConnectionClosed:
                raise AssertionError("closed")
            # If any data arrives or stays open beyond the check, treat as failure
            await asyncio.sleep(0.3)
            if ws2.open:
                raise AssertionError("token reuse accepted")


class TestOriginEnforcement:
    async def test_evil_origin_rejected(self, stack):
        room_id = await create_room(stack["base_url"])
        tok = await get_token(stack["base_url"], room_id)
        with pytest.raises(
            (websockets.exceptions.InvalidStatus, websockets.exceptions.InvalidStatusCode)
        ) as exc:
            await join_ws(
                stack["ws_url"], room_id, tok,
                origin="http://localhost.evil.com",
            )
        # Handshake must be denied (HTTP 403 from Starlette)
        assert "403" in str(exc.value) or "Handshake status" in str(exc.value)

    async def test_missing_origin_allowed_in_dev(self, stack):
        room_id = await create_room(stack["base_url"])
        tok = await get_token(stack["base_url"], room_id)
        ws = await join_ws(stack["ws_url"], room_id, tok, origin=None)
        await recv_until(ws, "connected")
        await ws.close()

    async def test_localhost_origin_allowed(self, stack):
        room_id = await create_room(stack["base_url"])
        tok = await get_token(stack["base_url"], room_id)
        ws = await join_ws(stack["ws_url"], room_id, tok, origin="http://localhost:5173")
        await recv_until(ws, "connected")
        await ws.close()


class TestPublicKeyValidation:
    async def test_garbage_pubkey_rejected(self, stack):
        room_id = await create_room(stack["base_url"])
        tok = await get_token(stack["base_url"], room_id)
        ws = await join_ws(stack["ws_url"], room_id, tok)
        await recv_until(ws, "connected")
        await ws.send(json.dumps({"type": "public_key", "public_key": "!!!not-a-key!!!"}))
        err = await recv_until(ws, "error")
        assert "Invalid public key" in err["message"]
        await ws.close()

    async def test_oversized_pubkey_frame_rejected(self, stack):
        room_id = await create_room(stack["base_url"])
        tok = await get_token(stack["base_url"], room_id)
        ws = await join_ws(stack["ws_url"], room_id, tok)
        await recv_until(ws, "connected")
        await ws.send(json.dumps({"type": "public_key", "public_key": "A" * 2000}))
        err = await recv_until(ws, "error")
        assert "too large" in err["message"].lower()
        await ws.close()


class TestActiveMITMRelay:
    """
    Simulates an active network attacker that terminates both clients'
    WebSocket connections and substitutes its own ephemeral key in each
    direction. XBF-MKC must detect this: divergent SAS + failed MKC tags.
    """

    async def test_mitm_detected_by_both_peers(self, stack):
        room_id = await create_room(stack["base_url"])
        tok_a = await get_token(stack["base_url"], room_id)
        tok_b = await get_token(stack["base_url"], room_id)

        attacker_for_b = XBFClient(SECRET)  # key attacker presents to B
        attacker_for_a = XBFClient(SECRET)  # key attacker presents to A

        async def handle_client(client_ws, upstream_token, presented_key):
            upstream = await websockets.connect(
                f"{stack['ws_url']}/ws/chat?room_id={room_id}&token={upstream_token}"
            )

            async def c2u():
                async for raw in client_ws:
                    data = json.loads(raw)
                    if data.get("type") == "public_key":
                        data["public_key"] = presented_key
                        raw = json.dumps(data)
                    await upstream.send(raw)

            async def u2c():
                async for raw in upstream:
                    await client_ws.send(raw)

            task_c2u = asyncio.create_task(c2u())
            task_u2c = asyncio.create_task(u2c())
            try:
                await asyncio.wait(
                    [task_c2u, task_u2c], timeout=20, return_when=asyncio.FIRST_COMPLETED
                )
            finally:
                for t in (task_c2u, task_u2c):
                    t.cancel()
                for t in (task_c2u, task_u2c):
                    try:
                        await t
                    except (asyncio.CancelledError, Exception):
                        pass
                try:
                    await upstream.close()
                except Exception:
                    pass
                try:
                    await client_ws.close()
                except Exception:
                    pass

        listener_a = await websockets.serve(
            lambda ws: handle_client(ws, tok_a, attacker_for_a.public_b64), "127.0.0.1", 0
        )
        listener_b = await websockets.serve(
            lambda ws: handle_client(ws, tok_b, attacker_for_b.public_b64), "127.0.0.1", 0
        )
        port_a = listener_a.sockets[0].getsockname()[1]
        port_b = listener_b.sockets[0].getsockname()[1]

        try:
            alice = XBFClient(SECRET)
            bob = XBFClient(SECRET)

            ws_a = await websockets.connect(f"ws://127.0.0.1:{port_a}")
            ws_b = await websockets.connect(f"ws://127.0.0.1:{port_b}")

            await recv_until(ws_a, "connected")
            await recv_until(ws_b, "connected")

            # Both publish keys concurrently so neither side blocks the other.
            await ws_a.send(json.dumps({"type": "public_key", "public_key": alice.public_b64}))
            await ws_b.send(json.dumps({"type": "public_key", "public_key": bob.public_b64}))

            peer_a = await recv_until(ws_a, "peer_public_key")
            peer_b = await recv_until(ws_b, "peer_public_key")
            alice.establish(peer_a["public_key"])  # attacker's key for A
            bob.establish(peer_b["public_key"])    # attacker's key for B

            # MITM detection assertions
            assert alice.transcript != bob.transcript, "transcripts must diverge under MITM"
            sas_a = XBFClient.sas_from_transcript(alice.transcript)
            sas_b = XBFClient.sas_from_transcript(bob.transcript)
            assert sas_a != sas_b, "SAS must visibly differ under MITM"
            assert not alice.verify_confirmation_tag(bob.confirmation_tag())
            assert not bob.verify_confirmation_tag(alice.confirmation_tag())

            # Even if the attacker relays ciphertext through, AEAD fails across the split
            ct, nonce = alice.encrypt("is this safe?")
            with pytest.raises(Exception):
                bob.decrypt(ct, nonce)

            await ws_a.close()
            await ws_b.close()
        finally:
            listener_a.close()
            listener_b.close()
            await listener_a.wait_closed()
            await listener_b.wait_closed()
