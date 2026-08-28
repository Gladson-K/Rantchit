// Uses Web Crypto API
export class E2EECrypto {
  private keyPair: CryptoKeyPair | null = null;
  private sharedSecret: CryptoKey | null = null;
  private roomSecret: string | null = null;

  async generateRoomSecret(): Promise<string> {
    const secretBytes = crypto.getRandomValues(new Uint8Array(32));
    this.roomSecret = base64UrlEncode(secretBytes);
    return this.roomSecret;
  }

  async generateKeyPair(): Promise<string> {
    this.keyPair = await crypto.subtle.generateKey(
      { name: 'X25519' },
      true, // extractable (we will export public key)
      ['deriveKey', 'deriveBits']
    );
    const publicKey = await crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    return base64UrlEncode(new Uint8Array(publicKey));
  }

  async importPeerPublicKey(peerPublicKeyB64: string): Promise<void> {
    if (!this.keyPair) throw new Error('Key pair not generated');
    const peerKeyBytes = base64UrlDecode(peerPublicKeyB64);
    const peerPublicKey = await crypto.subtle.importKey(
      'raw',
      peerKeyBytes,
      { name: 'X25519' },
      false,
      []
    );
    // Derive shared secret
    const derivedBits = await crypto.subtle.deriveBits(
      { name: 'X25519', public: peerPublicKey },
      this.keyPair.privateKey,
      256
    );
    // Use HKDF to derive AES-GCM key
    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      derivedBits,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );
    this.sharedSecret = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: new TextEncoder().encode('veilchat-session-key')
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async encryptMessage(plaintext: string): Promise<{ ciphertext: string; nonce: string }> {
    if (!this.sharedSecret) throw new Error('Shared secret not established');
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      this.sharedSecret,
      encoded
    );
    return {
      ciphertext: base64UrlEncode(new Uint8Array(ciphertext)),
      nonce: base64UrlEncode(nonce)
    };
  }

  async decryptMessage(ciphertextB64: string, nonceB64: string): Promise<string> {
    if (!this.sharedSecret) throw new Error('Shared secret not established');
    const ciphertext = base64UrlDecode(ciphertextB64);
    const nonce = base64UrlDecode(nonceB64);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      this.sharedSecret,
      ciphertext
    );
    return new TextDecoder().decode(plaintext);
  }

  getRoomSecretHash(): string {
    if (!this.roomSecret) throw new Error('Room secret not generated');
    // SHA-256 hex for API
    return sha256Hex(this.roomSecret);
  }

  getRoomSecret(): string {
    return this.roomSecret || '';
  }
}

// Utility functions
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}