export interface Room {
  roomId: string;
  expiresAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'peer';
  ciphertext: string; // base64
  nonce: string;      // base64
  timestamp: number;
}