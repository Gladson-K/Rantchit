import { GameMeta } from './types';

export const DEFAULT_EXPIRY_MINUTES = 60;

export const EXPIRY_OPTIONS = [
  { label: '15 MINUTES', value: 15 },
  { label: '30 MINUTES', value: 30 },
  { label: '1 HOUR (DEFAULT)', value: 60 },
  { label: '6 HOURS', value: 360 },
  { label: '24 HOURS (MAX)', value: 1440 },
];

/** Host-selectable room capacity. Server clamps to ROOM_MAX_PARTICIPANTS_LIMIT. */
export const PARTICIPANT_OPTIONS = [2, 3, 4, 5, 6, 8];
export const MAX_PARTICIPANTS_LIMIT = 8;
export const DEFAULT_MAX_PARTICIPANTS = 2;

export const SAS_EMOJIS = [
  '⚡', '🌟', '🛡️', '🔑', '🚀', '🌌', '💎', '🔥',
  '🌊', '🦊', '🦅', '🍀', '🎯', '🎨', '🧩', '⚓',
  '🔮', '🪐', '🌙', '☀️', '🌈', '🕊️', '🦁', '🐬'
];

export const SAS_WORDS = [
  'ALPHA', 'BRAVO', 'COSMIC', 'DELTA', 'ECHO', 'FALCON',
  'GALAXY', 'HORIZON', 'INDIGO', 'JUPITER', 'KESTREL', 'LUMEN',
  'MATRIX', 'NEBULA', 'ORBIT', 'PHOENIX', 'QUANTUM', 'RADIUS',
  'SOLAR', 'TITAN', 'ULTRA', 'VECTOR', 'WAVELENGTH', 'ZENITH'
];

export const GAME_CATALOG: GameMeta[] = [
  {
    id: 'snake',
    title: 'PIXEL SNAKE',
    players: '1 PLAYER',
    icon: '🐍',
    color: 'green',
    description: 'Classic grid-crawler. Eat the data-bits, avoid the walls.',
  },
  {
    id: 'tictactoe',
    title: 'TIC-TAC-TOE',
    players: '2 PLAYERS',
    icon: '❌',
    color: 'cyan',
    description: 'Turn-based duel over the encrypted relay. Winner takes the room.',
  },
];
