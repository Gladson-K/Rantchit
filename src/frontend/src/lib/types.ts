export type RoomMode = 'chat' | 'lounge';

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

export interface Peer {
  peerId: string;
  alias: string;
  isHost: boolean;
  hasKey: boolean;
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
  peerId?: string;
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
  | 'group_ready'
  | 'confirmed'
  | 'security_alert'
  | 'disconnected'
  | 'destroyed'
  | 'error';

export type MkcStatus = 'pending' | 'confirmed' | 'failed' | 'group';

export interface SASData {
  code: string;
  emojis: string[];
  words: string;
  transcript: string;
}

/** LAN signal that is either a chat/voice/game envelope or a control frame. */
export interface AppEnvelope {
  kind: 'chat' | 'voice' | 'game' | 'presence';
  [key: string]: unknown;
}

export type GameId = 'snake' | 'tictactoe' | 'breakout' | 'external' | 'flash';

/** How a game is delivered. */
export type GameKind = 'builtin' | 'external';
/** Runtime engine for embedded games. */
export type GameRuntime = 'html5' | 'flash';

export interface GameMeta {
  id: GameId;
  title: string;
  players: string;
  icon: string;
  color: string;
  description: string;
  /** `builtin` = bundled React game; `external` = sandboxed iframe embed. */
  kind: GameKind;
  /** Runtime for external games; `flash` requires the self-hosted Ruffle WASM. */
  runtime?: GameRuntime;
  /** URL for external games (https for internet, or `/games/...` self-hosted). */
  url?: string;
}

export type VoiceState = 'idle' | 'requesting' | 'connecting' | 'live' | 'denied' | 'error';

export interface VoicePeerState {
  peerId: string;
  muted: boolean;
  connected: boolean;
}
