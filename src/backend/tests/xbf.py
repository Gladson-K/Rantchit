"""
Rantchit XBF-MKC v1 — Python reference implementation.

Mirrors src/frontend/src/lib/crypto.ts byte-for-byte so backend/protocol tests
validate the exact same construction the browser runs:

    T   = SHA-256(PROTO_ID | roomSecretHash | min(pubA,pubB) | max(pubA,pubB))
    Z   = ECDH-P256(local_priv, peer_pub)
    K_enc = HKDF-SHA256(Z, salt=SHA-256(roomSecretHash), info=PROTO|enc|T)  -> AES-256-GCM
    K_mac = HKDF-SHA256(Z, salt=SHA-256(roomSecretHash), info=PROTO|mac|T)  -> HMAC-SHA256
    MKC tag = HMAC-SHA256(K_mac, PROTO|mkc|T)
    AEAD    = AES-256-GCM(K_enc, iv, plaintext, AAD=PROTO|T)
"""
import base64
import hashlib
import os
from typing import Tuple

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes, hmac
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

PROTO_ID = "RANTCHIT-XBF-MKC-v1"


def b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64d(text: str) -> bytes:
    padded = text + "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(padded)


class XBFClient:
    def __init__(self, room_secret: str):
        self._private = ec.generate_private_key(ec.SECP256R1())
        self.public_raw = self._private.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        self.public_b64 = b64e(self.public_raw)
        self.room_secret_hash = hashlib.sha256(room_secret.encode()).hexdigest()
        self.transcript: str | None = None
        self._enc_key: bytes | None = None
        self._mac_key: bytes | None = None
        self._peer_pub_b64: str | None = None

    @property
    def has_session(self) -> bool:
        return self.transcript is not None

    def establish(self, peer_public_b64: str) -> str:
        if peer_public_b64 == self.public_b64:
            raise ValueError("refusing self-session")
        peer_pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), b64d(peer_public_b64))
        shared_bits = self._private.exchange(ec.ECDH(), peer_pub)

        low, high = sorted([self.public_b64, peer_public_b64])
        transcript_input = f"{PROTO_ID}|{self.room_secret_hash}|{low}|{high}"
        self.transcript = hashlib.sha256(transcript_input.encode()).hexdigest()
        self._peer_pub_b64 = peer_public_b64

        salt = hashlib.sha256(self.room_secret_hash.encode()).digest()
        self._enc_key = HKDF(
            algorithm=hashes.SHA256(), length=32, salt=salt,
            info=f"{PROTO_ID}|enc|{self.transcript}".encode(),
        ).derive(shared_bits)
        self._mac_key = HKDF(
            algorithm=hashes.SHA256(), length=32, salt=salt,
            info=f"{PROTO_ID}|mac|{self.transcript}".encode(),
        ).derive(shared_bits)
        return self.transcript

    def confirmation_tag(self) -> str:
        assert self._mac_key and self.transcript
        h = hmac.HMAC(self._mac_key, hashes.SHA256())
        h.update(f"{PROTO_ID}|mkc|{self.transcript}".encode())
        return b64e(h.finalize())

    def verify_confirmation_tag(self, peer_tag_b64: str) -> bool:
        import hmac as std_hmac
        expected = self.confirmation_tag()
        return std_hmac.compare_digest(expected, peer_tag_b64)

    def _aad(self) -> bytes:
        assert self.transcript
        return f"{PROTO_ID}|{self.transcript}".encode()

    def encrypt(self, plaintext: str) -> Tuple[str, str]:
        assert self._enc_key and self.transcript
        nonce = os.urandom(12)
        ct = AESGCM(self._enc_key).encrypt(nonce, plaintext.encode(), self._aad())
        return b64e(ct), b64e(nonce)

    def decrypt(self, ciphertext_b64: str, nonce_b64: str) -> str:
        assert self._enc_key and self.transcript
        pt = AESGCM(self._enc_key).decrypt(b64d(nonce_b64), b64d(ciphertext_b64), self._aad())
        return pt.decode()

    @staticmethod
    def sas_from_transcript(transcript_hex: str) -> dict:
        digest = hashlib.sha256(f"RANTCHIT-SAS|{transcript_hex}".encode()).digest()
        code = digest[:3].hex().upper()
        from tests.sas_wordlists import SAS_EMOJIS, SAS_WORDS
        emojis = [SAS_EMOJIS[digest[i] % len(SAS_EMOJIS)] for i in range(4)]
        words = " - ".join(SAS_WORDS[digest[i] % len(SAS_WORDS)] for i in range(4, 7))
        return {"code": code, "emojis": emojis, "words": words}
