import { useRef, useState, useCallback } from 'react';
import { E2EECrypto } from '../lib/crypto';

export function useCrypto() {
  const cryptoRef = useRef<E2EECrypto>(new E2EECrypto());
  const [isInitialized, setIsInitialized] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [hasSharedKey, setHasSharedKey] = useState(false);

  const initialize = useCallback(async () => {
    try {
      const pubKey = await cryptoRef.current.generateKeyPair();
      setPublicKey(pubKey);
      setIsInitialized(true);
      return pubKey;
    } catch (err) {
      console.error('Failed to initialize cryptographic keypair:', err);
      throw err;
    }
  }, []);

  const importPeerPublicKey = useCallback(async (peerKey: string) => {
    try {
      await cryptoRef.current.importPeerPublicKey(peerKey);
      setHasSharedKey(true);
    } catch (err) {
      console.error('Failed to import peer public key:', err);
      throw err;
    }
  }, []);

  const encrypt = useCallback(async (plaintext: string) => {
    return cryptoRef.current.encryptMessage(plaintext);
  }, []);

  const decrypt = useCallback(async (ciphertext: string, nonce: string) => {
    return cryptoRef.current.decryptMessage(ciphertext, nonce);
  }, []);

  return {
    crypto: cryptoRef.current,
    isInitialized,
    publicKey,
    hasSharedKey,
    initialize,
    importPeerPublicKey,
    encrypt,
    decrypt
  };
}