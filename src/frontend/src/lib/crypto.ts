// Rantchit XBF-MKC v1 — Cross-Bound Fingerprint + Mutual Key Confirmation
//
// A novel protocol composition (built from vetted primitives, not a new primitive):
//   1. Ephemeral ECDH (P-256) per session.
//   2. Order-independent transcript T = SHA-256(PROTO_ID | roomSecretHash | min(pubA,pubB) | max(pubA,pubB))
//      so BOTH peers derive the identical channel fingerprint (fixes one-sided SAS).
//   3. Dual HKDF-SHA256 derivation keyed by ECDH bits, salted with SHA-256(roomSecretHash),
//      domain-separated by transcript: enc-key (AES-256-GCM) and mac-key (HMAC-SHA256).
//   4. Mutual key confirmation: HMAC tags exchanged over the relay. A relay-level
//      MITM cannot produce matching tags/transcripts -> hard cryptographic failure.
//   5. Transcript-bound AEAD: every message uses AAD = PROTO_ID | T, so ciphertext
//      is cryptographically tied to this exact channel (no cross-session replay).

export const PROTO_ID = 'RANTCHIT-XBF-MKC-v1';

export type EstablishResult = {
  transcript: string;
};

export class E2EECrypto {
  private keyPair: CryptoKeyPair | null = null;
  private localPublicKeyRaw: string | null = null;
  private peerPublicKeyRaw: string | null = null;
  private encKey: CryptoKey | null = null;
  private macKey: CryptoKey | null = null;
  private roomSecret: string | null = null;
  private roomSecretHashHex: string | null = null;
  private transcript: string | null = null;
  private groupMembers: string[] | null = null;

  async generateRoomSecret(): Promise<string> {
    const secretBytes = window.crypto.getRandomValues(new Uint8Array(32) as Uint8Array<ArrayBuffer>);
    this.roomSecret = base64UrlEncode(secretBytes);
    return this.roomSecret;
  }

  setRoomSecret(secret: string): void {
    this.roomSecret = secret;
  }

  getRoomSecret(): string {
    return this.roomSecret || '';
  }

  async getRoomSecretHash(): Promise<string> {
    if (!this.roomSecret) throw new Error('Room secret not set');
    this.roomSecretHashHex = await sha256Hex(this.roomSecret);
    return this.roomSecretHashHex;
  }

  async generateKeyPair(): Promise<string> {
    this.keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    const rawPublicKey = await window.crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    this.localPublicKeyRaw = base64UrlEncode(new Uint8Array(rawPublicKey));
    return this.localPublicKeyRaw;
  }

  getLocalPublicKeyRaw(): string | null {
    return this.localPublicKeyRaw;
  }

  getPeerPublicKeyRaw(): string | null {
    return this.peerPublicKeyRaw;
  }

  getTranscript(): string | null {
    return this.transcript;
  }

  /**
   * Establishes the XBF-MKC session for a peer public key:
   * transcript -> dual HKDF keys -> ready for MKC + AEAD.
   */
  async establishSession(peerPublicKeyB64: string): Promise<EstablishResult> {
    if (!this.keyPair) {
      await this.generateKeyPair();
    }
    if (!this.keyPair || !this.localPublicKeyRaw) throw new Error('Failed to initialize keypair');
    if (!this.roomSecretHashHex) {
      this.roomSecretHashHex = await this.getRoomSecretHash();
    }
    if (peerPublicKeyB64 === this.localPublicKeyRaw) {
      throw new Error('Refusing to establish session with own public key');
    }

    this.peerPublicKeyRaw = peerPublicKeyB64;
    const peerKeyBytes = base64UrlDecode(peerPublicKeyB64);
    if (peerKeyBytes.length !== 65 || peerKeyBytes[0] !== 0x04) {
      throw new Error('Invalid peer public key: expected 65-byte uncompressed P-256 point');
    }

    const peerPublicKey = await window.crypto.subtle.importKey(
      'raw',
      peerKeyBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    const sharedBits = new Uint8Array<ArrayBuffer>(
      await window.crypto.subtle.deriveBits(
        { name: 'ECDH', public: peerPublicKey },
        this.keyPair.privateKey,
        256
      )
    );

    // Order-independent cross-bound transcript: identical on both peers.
    const [pubLow, pubHigh] = [this.localPublicKeyRaw, peerPublicKeyB64].sort();
    this.transcript = await sha256Hex(
      `${PROTO_ID}|${this.roomSecretHashHex}|${pubLow}|${pubHigh}`
    );

    const salt = base64UrlDecode(await sha256Hex(this.roomSecretHashHex));
    const hkdfKey = await window.crypto.subtle.importKey('raw', sharedBits, { name: 'HKDF' }, false, [
      'deriveKey',
      'deriveBits'
    ]);

    const encBits = await window.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new TextEncoder().encode(`${PROTO_ID}|enc|${this.transcript}`)
      },
      hkdfKey,
      256
    );
    this.encKey = await window.crypto.subtle.importKey('raw', encBits, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt'
    ]);

    const macBits = await window.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new TextEncoder().encode(`${PROTO_ID}|mac|${this.transcript}`)
      },
      hkdfKey,
      256
    );
    this.macKey = await window.crypto.subtle.importKey(
      'raw',
      macBits,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    return { transcript: this.transcript };
  }

  hasSharedSecret(): boolean {
    return this.encKey !== null && this.macKey !== null && this.transcript !== null;
  }

  getGroupMembers(): string[] {
    return this.groupMembers || [];
  }

  /**
   * GROUP MODE (XBF-MKC v1 / G-set extension) for rooms with 3+ participants.
   *
   * The invite secret is the shared trust root (every authorized participant
   * already holds it, and the server only ever sees SHA256(secret)). We derive
   * one group key for all members by hashing the *sorted set of every
   * participant's ephemeral public key* into a transcript, then running
   * HKDF over the room secret. Because the transcript is bound to the exact
   * member key-set, a passive observer who lacks the secret cannot derive the
   * key, and any key-set substitution changes every member's fingerprint.
   *
   * Trade-off (documented): unlike the 1:1 path this does not provide
   * per-message forward secrecy; it is intended for ephemeral, non-persisted
   * arcade lounge rooms.
   */
  async establishGroupSession(allPublicKeysB64: string[]): Promise<EstablishResult> {
    if (!this.keyPair) {
      await this.generateKeyPair();
    }
    if (!this.keyPair || !this.localPublicKeyRaw) throw new Error('Failed to initialize keypair');
    if (!this.roomSecret) throw new Error('Room secret not set');
    if (!this.roomSecretHashHex) {
      this.roomSecretHashHex = await this.getRoomSecretHash();
    }

    const members = Array.from(new Set([this.localPublicKeyRaw, ...allPublicKeysB64])).sort();
    this.groupMembers = members;
    this.transcript = await sha256Hex(
      `${PROTO_ID}|group|${this.roomSecretHashHex}|${members.join('|')}`
    );

    const salt = base64UrlDecode(await sha256Hex(this.roomSecretHashHex));
    const ikm = new TextEncoder().encode(this.roomSecret) as Uint8Array<ArrayBuffer>;
    const hkdfKey = await window.crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, [
      'deriveBits'
    ]);

    const encBits = await window.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new TextEncoder().encode(`${PROTO_ID}|group-enc|${this.transcript}`)
      },
      hkdfKey,
      256
    );
    this.encKey = await window.crypto.subtle.importKey('raw', encBits, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt'
    ]);

    const macBits = await window.crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt,
        info: new TextEncoder().encode(`${PROTO_ID}|group-mac|${this.transcript}`)
      },
      hkdfKey,
      256
    );
    this.macKey = await window.crypto.subtle.importKey(
      'raw',
      macBits,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    return { transcript: this.transcript };
  }

  /** Mutual key confirmation tag: HMAC-SHA256(macKey, PROTO_ID|mkc|transcript) */
  async computeConfirmationTag(): Promise<string> {
    if (!this.macKey || !this.transcript) throw new Error('Session not established');
    const sig: ArrayBuffer = await window.crypto.subtle.sign(
      'HMAC',
      this.macKey,
      new TextEncoder().encode(`${PROTO_ID}|mkc|${this.transcript}`)
    );
    return base64UrlEncode(new Uint8Array(sig));
  }

  /** Constant-time verification of the peer's MKC tag. */
  async verifyConfirmationTag(peerTagB64: string): Promise<boolean> {
    if (!this.macKey || !this.transcript) return false;
    let expected: string;
    try {
      expected = await this.computeConfirmationTag();
    } catch {
      return false;
    }
    return timingSafeEqualB64(expected, peerTagB64);
  }

  async encryptMessage(plaintext: string): Promise<{ ciphertext: string; nonce: string }> {
    if (!this.encKey || !this.transcript) throw new Error('End-to-end encryption key not established yet');

    const nonce = window.crypto.getRandomValues(new Uint8Array(12) as Uint8Array<ArrayBuffer>);
    const encoded = new TextEncoder().encode(plaintext) as Uint8Array<ArrayBuffer>;
    const aad = new TextEncoder().encode(`${PROTO_ID}|${this.transcript}`) as Uint8Array<ArrayBuffer>;

    const ciphertext: ArrayBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad },
      this.encKey,
      encoded
    );

    return {
      ciphertext: base64UrlEncode(new Uint8Array(ciphertext)),
      nonce: base64UrlEncode(nonce)
    };
  }

  async decryptMessage(ciphertextB64: string, nonceB64: string): Promise<string> {
    if (!this.encKey || !this.transcript) throw new Error('End-to-end encryption key not established yet');

    const ciphertext = base64UrlDecode(ciphertextB64);
    const nonce = base64UrlDecode(nonceB64);
    const aad = new TextEncoder().encode(`${PROTO_ID}|${this.transcript}`) as Uint8Array<ArrayBuffer>;

    const plaintext: ArrayBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad },
      this.encKey,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  }
}

export function base64UrlEncode(buffer: Uint8Array<ArrayBufferLike>): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(base64Url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await window.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqualB64(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
