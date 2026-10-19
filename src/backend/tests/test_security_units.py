"""Unit tests for hardened security helpers."""
import hashlib
import hmac

import pytest

from app.security import (
    hash_room_secret,
    safe_secret_compare,
    generate_join_token,
    hash_ip,
    is_allowed_ws_origin,
    is_valid_p256_uncompressed_b64,
    ensure_aware,
)
from datetime import datetime, timezone


class TestHashing:
    def test_hash_room_secret_matches_hashlib(self):
        secret = "dGVzdC1zZWNyZXQtMzItYnl0ZXMtcmFuZG9taXplZCEh"
        assert hash_room_secret(secret) == hashlib.sha256(secret.encode()).hexdigest()

    def test_safe_secret_compare(self):
        assert safe_secret_compare("abc", "abc")
        assert not safe_secret_compare("abc", "abd")
        assert not safe_secret_compare("abc", "abcd")

    def test_join_token_entropy(self):
        tokens = {generate_join_token() for _ in range(50)}
        assert len(tokens) == 50
        assert all(len(t) >= 40 for t in tokens)

    def test_hash_ip_keyed_and_distinct(self):
        a1 = hash_ip("1.2.3.4")
        a2 = hash_ip("1.2.3.4")
        b = hash_ip("5.6.7.8")
        assert a1 == a2
        assert a1 != b
        assert len(a1) == 64


class TestOriginValidation:
    """Regression suite for the WebSocket cross-site hijack surface."""

    def test_missing_origin_allowed_in_dev(self):
        assert is_allowed_ws_origin(None) is True

    def test_null_origin_rejected(self):
        assert is_allowed_ws_origin("null") is False

    def test_exact_localhost_allowed(self):
        assert is_allowed_ws_origin("http://localhost:5173") is True
        assert is_allowed_ws_origin("http://127.0.0.1:8080") is True

    def test_substring_bypass_rejected(self):
        # The original code used `"localhost" in origin` — this was the bypass.
        assert is_allowed_ws_origin("http://localhost.evil.com") is False
        assert is_allowed_ws_origin("http://evil.com/localhost") is False
        assert is_allowed_ws_origin("https://localhost.attacker.io:443") is False

    def test_allowlist_respected(self):
        assert is_allowed_ws_origin("https://app.rantchit.example") is True
        assert is_allowed_ws_origin("https://evil.example") is False


class TestPubkeyValidation:
    def test_valid_uncompressed_p256(self):
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        from tests.xbf import b64e
        pub = ec.generate_private_key(ec.SECP256R1()).public_key()
        raw = pub.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        assert is_valid_p256_uncompressed_b64(b64e(raw)) is True

    def test_rejects_garbage(self):
        assert is_valid_p256_uncompressed_b64("not-a-key") is False
        assert is_valid_p256_uncompressed_b64("") is False
        assert is_valid_p256_uncompressed_b64("A" * 500) is False
        # Compressed point marker (0x02/0x03) must be rejected
        from tests.xbf import b64e
        fake = b64e(b"\x02" + b"\x11" * 32)
        assert is_valid_p256_uncompressed_b64(fake) is False


class TestEnsureAware:
    def test_naive_becomes_utc(self):
        dt = datetime(2030, 1, 1, 12, 0, 0)
        out = ensure_aware(dt)
        assert out.tzinfo == timezone.utc

    def test_aware_preserved(self):
        tz = timezone.utc
        dt = datetime(2030, 1, 1, tzinfo=tz)
        assert ensure_aware(dt) is dt
