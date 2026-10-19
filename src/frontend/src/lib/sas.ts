import { SAS_EMOJIS, SAS_WORDS } from './constants';
import { SASData } from './types';

/**
 * Derives the Short Authentication String from the XBF-MKC channel transcript.
 * Both peers compute the identical transcript, so both display identical SAS.
 */
export async function generateSASFromTranscript(transcriptHex: string): Promise<SASData> {
  const hashArray = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`RANTCHIT-SAS|${transcriptHex}`))
    )
  );

  const code = hashArray
    .slice(0, 3)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  const emojis = [
    SAS_EMOJIS[hashArray[0] % SAS_EMOJIS.length],
    SAS_EMOJIS[hashArray[1] % SAS_EMOJIS.length],
    SAS_EMOJIS[hashArray[2] % SAS_EMOJIS.length],
    SAS_EMOJIS[hashArray[3] % SAS_EMOJIS.length]
  ];

  const words = [
    SAS_WORDS[hashArray[4] % SAS_WORDS.length],
    SAS_WORDS[hashArray[5] % SAS_WORDS.length],
    SAS_WORDS[hashArray[6] % SAS_WORDS.length]
  ].join(' - ');

  return { code, emojis, words, transcript: transcriptHex };
}
