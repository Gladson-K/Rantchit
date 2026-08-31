import re

HEX_64_REGEX = re.compile(r"^[0-9a-fA-F]{64}$")

def is_valid_sha256_hex(value: str) -> bool:
    """Checks if input string is a valid 64-character SHA-256 hex string."""
    if not isinstance(value, str):
        return False
    return bool(HEX_64_REGEX.match(value.strip()))
