// Rantchit Web Crypto Implementation: ECDH (P-256) + HKDF-SHA256 + AES-256-GCM

export class E2EECrypto {
  private keyPair: CryptoKeyPair | null = null;
  private sharedSecret: CryptoKey | null = null;
  private roomSecret: string | null = null;
  private peerPublicKeyRaw: string | null = null;

  async generateRoomSecret(): Promise<string> {
    const secretBytes = window.crypto.getRandomValues(new Uint8Array(32));
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
    return sha256Hex(this.roomSecret);
  }

  async generateKeyPair(): Promise<string> {
    this.keyPair = await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey', 'deriveBits']
    );
    const rawPublicKey = await window.crypto.subtle.exportKey('raw', this.keyPair.publicKey);
    return base64UrlEncode(new Uint8Array(rawPublicKey));
  }

  async importPeerPublicKey(peerPublicKeyB64: string): Promise<void> {
    if (!this.keyPair) {
      await this.generateKeyPair();
    }
    if (!this.keyPair) throw new Error('Failed to initialize keypair');

    this.peerPublicKeyRaw = peerPublicKeyB64;
    const peerKeyBytes = base64UrlDecode(peerPublicKeyB64);
    
    const peerPublicKey = await window.crypto.subtle.importKey(
      'raw',
      peerKeyBytes,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // Derive raw shared secret bits
    const derivedBits = await window.crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      this.keyPair.privateKey,
      256
    );

    // Import derived bits into HKDF key
    const hkdfKey = await window.crypto.subtle.importKey(
      'raw',
      derivedBits,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );

    // Derive AES-GCM-256 session key
    this.sharedSecret = await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: new TextEncoder().encode('rantchit-session-key')
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  hasSharedSecret(): boolean {
    return this.sharedSecret !== null;
  }

  getPeerPublicKeyRaw(): string | null {
    return this.peerPublicKeyRaw;
  }

  async encryptMessage(plaintext: string): Promise<{ ciphertext: string; nonce: string }> {
    if (!this.sharedSecret) throw new Error('End-to-end encryption key not established yet');
    
    const nonce = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit AES-GCM IV
    const encoded = new TextEncoder().encode(plaintext);
    
    const ciphertext = await window.crypto.subtle.encrypt(
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
    if (!this.sharedSecret) throw new Error('End-to-end encryption key not established yet');
    
    const ciphertext = base64UrlDecode(ciphertextB64);
    const nonce = base64UrlDecode(nonceB64);
    
    const plaintext = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      this.sharedSecret,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  }
}

// Utility functions
export function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(base64Url: string): Uint8Array {
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