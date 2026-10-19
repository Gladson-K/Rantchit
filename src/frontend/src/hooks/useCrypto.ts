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

  const establishSession = useCallback(async (peerKey: string): Promise<string> => {
    try {
      const { transcript } = await cryptoRef.current.establishSession(peerKey);
      setHasSharedKey(true);
      return transcript;
    } catch (err) {
      console.error('Failed to establish XBF-MKC session:', err);
      throw err;
    }
  }, []);

  const computeConfirmationTag = useCallback(async () => {
    return cryptoRef.current.computeConfirmationTag();
  }, []);

  const verifyConfirmationTag = useCallback(async (peerTag: string) => {
    return cryptoRef.current.verifyConfirmationTag(peerTag);
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
    establishSession,
    computeConfirmationTag,
    verifyConfirmationTag,
    encrypt,
    decrypt
  };
}
