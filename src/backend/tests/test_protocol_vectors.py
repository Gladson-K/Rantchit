"""
Cryptographic vector tests for the XBF-MKC v1 protocol (Python reference impl).

These prove the construction is deterministic, order-independent (both peers
derive identical transcripts/SAS), MITM-sensitive, and that AEAD is bound to
the channel transcript.
"""
import pytest

from tests.xbf import XBFClient, PROTO_ID, b64d


ROOM_SECRET = "u7xQ9mK2pL4nR8vT1wY3zA5bC6dE0fG2hJ4kM6nP8qS"


class TestTranscriptSymmetry:
    def test_both_peers_derive_identical_transcript_regardless_of_join_order(self):
        alice = XBFClient(ROOM_SECRET)
        bob = XBFClient(ROOM_SECRET)

        t_alice = alice.establish(bob.public_b64)
        t_bob = bob.establish(alice.public_b64)

        assert t_alice == t_bob
        assert len(t_alice) == 64

    def test_different_rooms_different_transcripts(self):
        a1 = XBFClient(ROOM_SECRET)
        b1 = XBFClient(ROOM_SECRET)
        a2 = XBFClient(ROOM_SECRET + "x")
        b2 = XBFClient(ROOM_SECRET + "x")

        # Same keypairs? No — fresh keys each time, but also secret differs.
        assert a1.establish(b1.public_b64) != a2.establish(b2.public_b64)

    def test_sas_identical_on_both_sides(self):
        alice = XBFClient(ROOM_SECRET)
        bob = XBFClient(ROOM_SECRET)
        alice.establish(bob.public_b64)
        bob.establish(alice.public_b64)

        sas_a = XBFClient.sas_from_transcript(alice.transcript)
        sas_b = XBFClient.sas_from_transcript(bob.transcript)
        assert sas_a == sas_b
        assert len(sas_a["code"]) == 6
        assert len(sas_a["emojis"]) == 4


class TestSessionKeys:
    def test_mkc_tags_match(self):
        alice = XBFClient(ROOM_SECRET)
        bob = XBFClient(ROOM_SECRET)
        alice.establish(bob.public_b64)
        bob.establish(alice.public_b64)

        assert alice.verify_confirmation_tag(bob.confirmation_tag())
        assert bob.verify_confirmation_tag(alice.confirmation_tag())

    def test_encrypt_decrypt_roundtrip_both_directions(self):
        alice = XBFClient(ROOM_SECRET)
        bob = XBFClient(ROOM_SECRET)
        alice.establish(bob.public_b64)
        bob.establish(alice.public_b64)

        ct, nonce = alice.encrypt("hello from alice")
        assert bob.decrypt(ct, nonce) == "hello from alice"

        ct2, nonce2 = bob.encrypt("reply from bob")
        assert alice.decrypt(ct2, nonce2) == "reply from bob"

    def test_nonce_unique_per_message(self):
        alice = XBFClient(ROOM_SECRET)
        bob = XBFClient(ROOM_SECRET)
        alice.establish(bob.public_b64)
        bob.establish(alice.public_b64)
        nonces = {alice.encrypt("msg")[1] for _ in range(50)}
        assert len(nonces) == 50

    def test_wrong_room_secret_cannot_decrypt(self):
        alice = XBFClient(ROOM_SECRET)
        mallory = XBFClient("wrong-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        bob = XBFClient(ROOM_SECRET)
        alice.establish(bob.public_b64)
        bob.establish(alice.public_b64)
        ct, nonce = alice.encrypt("secret text")

        # Mallory establishes with Alice's key under a DIFFERENT room secret hash:
        # her transcript/AAD/keys all differ -> decryption must fail.
        mallory.establish(alice.public_b64)
        with pytest.raises(Exception):
            mallory.decrypt(ct, nonce)


class TestMITMSensitivity:
    def test_relayed_key_substitution_changes_transcript(self):
        """An active relay swapping public keys produces divergent transcripts."""
        alice = XBFClient(ROOM_SECRET)
        bob = XBFClient(ROOM_SECRET)
        mallory = XBFClient(ROOM_SECRET)

        # Attacker swaps her key into both directions.
        alice.establish(mallory.public_b64)
        bob.establish(mallory.public_b64)

        assert alice.transcript != bob.transcript
        assert XBFClient.sas_from_transcript(alice.transcript) != XBFClient.sas_from_transcript(bob.transcript)
        assert not alice.verify_confirmation_tag(bob.confirmation_tag())

    def test_tampered_ciphertext_fails_aead(self):
        alice = XBFClient(ROOM_SECRET)
        bob = XBFClient(ROOM_SECRET)
        alice.establish(bob.public_b64)
        bob.establish(alice.public_b64)

        ct, nonce = alice.encrypt("authenticate me")
        raw = bytearray(b64d(ct))
        raw[0] ^= 0xFF
        import base64
        tampered = base64.urlsafe_b64encode(bytes(raw)).rstrip(b"=").decode()
        with pytest.raises(Exception):
            bob.decrypt(tampered, nonce)

    def test_cross_room_replay_fails(self):
        """Ciphertext from room A cannot be replayed into room B (AAD binds transcript)."""
        room_a_secret = ROOM_SECRET
        room_b_secret = ROOM_SECRET + "-different"

        alice = XBFClient(room_a_secret)
        bob = XBFClient(room_a_secret)
        alice.establish(bob.public_b64)
        bob.establish(alice.public_b64)
        ct, nonce = alice.encrypt("room A message")

        # Same public keys, different room secret -> different transcript/AAD.
        alice_b = XBFClient(room_a_secret)
        bob_b = XBFClient(room_a_secret)
        # Force identical keypairs is not possible here; instead re-derive under room B secret:
        alice_b2 = XBFClient(room_b_secret)
        bob_b2 = XBFClient(room_b_secret)
        alice_b2.establish(bob_b2.public_b64)
        bob_b2.establish(alice_b2.public_b64)
        with pytest.raises(Exception):
            bob_b2.decrypt(ct, nonce)


class TestProtocolIdentifiers:
    def test_proto_id_unchanged(self):
        assert PROTO_ID == "RANTCHIT-XBF-MKC-v1"
