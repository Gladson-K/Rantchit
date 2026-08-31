import { SAS_EMOJIS, SAS_WORDS } from './constants';
import { SASData } from './types';

export async function generateSAS(secretHash: string, peerPubKey: string): Promise<SASData> {
  const combined = `${secretHash}:${peerPubKey}`;
  const enc = new TextEncoder().encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // 6-character hex code
  const code = hashArray.slice(0, 3).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  
  // 4 visual emojis
  const emojis = [
    SAS_EMOJIS[hashArray[0] % SAS_EMOJIS.length],
    SAS_EMOJIS[hashArray[1] % SAS_EMOJIS.length],
    SAS_EMOJIS[hashArray[2] % SAS_EMOJIS.length],
    SAS_EMOJIS[hashArray[3] % SAS_EMOJIS.length],
  ];

  // 3-word mnemonic
  const words = [
    SAS_WORDS[hashArray[4] % SAS_WORDS.length],
    SAS_WORDS[hashArray[5] % SAS_WORDS.length],
    SAS_WORDS[hashArray[6] % SAS_WORDS.length],
  ].join(' - ');

  return { code, emojis, words };
}
