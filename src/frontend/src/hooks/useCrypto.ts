import { useRef, useState } from 'react';
import { E2EECrypto } from '../lib/crypto';

export function useCrypto() {
  const cryptoRef = useRef(new E2EECrypto());
  const [isReady, setIsReady] = useState(false);

  const initialize = async () => {
    await cryptoRef.current.generateKeyPair();
    setIsReady(true);
  };

  return { crypto: cryptoRef.current, isReady, initialize };
}