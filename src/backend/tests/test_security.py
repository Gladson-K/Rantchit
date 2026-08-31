import pytest
import hashlib
from app.security import hash_room_secret, generate_join_token, hash_ip, now_utc

def test_hash_room_secret():
    secret = "random_test_secret_1234567890abcdef"
    expected = hashlib.sha256(secret.encode()).hexdigest()
    assert hash_room_secret(secret) == expected
    assert len(hash_room_secret(secret)) == 64

def test_generate_join_token():
    token1 = generate_join_token()
    token2 = generate_join_token()
    assert token1 != token2
    assert len(token1) >= 32

def test_hash_ip():
    ip1 = "192.168.1.1"
    ip2 = "192.168.1.2"
    hash1 = hash_ip(ip1)
    hash2 = hash_ip(ip2)
    assert hash1 != hash2
    assert hash1 == hash_ip(ip1)
    assert len(hash1) == 64

def test_now_utc():
    now = now_utc()
    assert now.tzinfo is not None
