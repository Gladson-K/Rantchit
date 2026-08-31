import pytest
from app.schemas import RoomCreate, JoinTokenRequest, RoomDestroyRequest

def test_schemas_validation():
    valid_create = RoomCreate(
        room_secret_hash="a" * 64,
        expires_in_minutes=60
    )
    assert valid_create.expires_in_minutes == 60

    valid_token_req = JoinTokenRequest(
        room_secret="some_very_secure_secret_key_32_bytes_long"
    )
    assert len(valid_token_req.room_secret) >= 32
