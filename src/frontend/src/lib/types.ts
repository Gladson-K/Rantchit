export interface Room {
  roomId: string;
  expiresAt: string;
  maxParticipants?: number;
  status?: string;
}

export interface RoomInfo {
  roomId: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  maxParticipants: number;
  participantCount: number;
  isExpired: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'me' | 'peer' | 'system';
  text?: string;
  ciphertext?: string;
  nonce?: string;
  timestamp: number;
  isVerified?: boolean;
  senderAlias?: string;
}

export type ConnectionStatusType =
  | 'idle'
  | 'initializing_crypto'
  | 'requesting_token'
  | 'connecting'
  | 'connected'
  | 'waiting_peer'
  | 'peer_joined'
  | 'keys_exchanged'
  | 'confirmed'
  | 'security_alert'
  | 'disconnected'
  | 'destroyed'
  | 'error';

export type MkcStatus = 'pending' | 'confirmed' | 'failed';

export interface SASData {
  code: string;
  emojis: string[];
  words: string;
  transcript: string;
}