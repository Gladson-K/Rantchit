import pytest
from app.utils.validation import is_valid_sha256_hex

def test_sha256_validation():
    valid = "a" * 64
    invalid_short = "a" * 63
    invalid_char = "g" * 64
    assert is_valid_sha256_hex(valid) is True
    assert is_valid_sha256_hex(invalid_short) is False
    assert is_valid_sha256_hex(invalid_char) is False
    assert is_valid_sha256_hex("") is False
