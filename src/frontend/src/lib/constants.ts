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

/**
 * Hosts allowed to be framed by the sandboxed external-game player. Anything
 * not listed is rejected in `ExternalGameFrame`, which keeps the strict CSP
 * meaningful and stops arbitrary third-party tracking frames. Add your own
 * trusted game host here if you self-host a library of HTML5 titles.
 */
export const EXTERNAL_GAME_HOSTS = [
  'archive.org',
  'www.archive.org',
  'playclassic.games',
  'www.playclassic.games',
  'emulatorgames.net',
  'www.emulatorgames.net',
];

/**
 * Self-hosted Ruffle (Flash Player emulator, WASM). Flash is EOL so browsers
 * cannot run `.swf` natively; Ruffle re-implements the runtime in WebAssembly.
 * Ship it from your own origin (e.g. `public/ruffle/`) so it satisfies
 * `script-src 'self'` and casts no third-party requests. Empty string means
 * "not installed" and the Flash player shows setup instructions instead.
 *
 * Install: download a Ruffle release and copy it to `public/ruffle/`:
 *   public/ruffle/ruffle.js
 *   public/ruffle/*.wasm
 */
export const RUFFLE_URL = '/ruffle/ruffle.js';

export const GAME_CATALOG: GameMeta[] = [
  {
    id: 'snake',
    title: 'PIXEL SNAKE',
    players: '1 PLAYER',
    icon: '🐍',
    color: 'green',
    description: 'Classic grid-crawler. Eat the data-bits, avoid the walls.',
    kind: 'builtin',
  },
  {
    id: 'tictactoe',
    title: 'TIC-TAC-TOE',
    players: '2 PLAYERS',
    icon: '❌',
    color: 'cyan',
    description: 'Turn-based duel over the encrypted relay. Winner takes the room.',
    kind: 'builtin',
  },
  {
    id: 'breakout',
    title: 'BRICK BREAKER',
    players: '1 PLAYER',
    icon: '🧱',
    color: 'amber',
    description: 'Retro paddle-and-ball brick smasher. Clear the grid.',
    kind: 'builtin',
  },
  {
    id: 'external',
    title: 'WEB ARCADE',
    players: 'ANY',
    icon: '🌐',
    color: 'purple',
    description: 'Load an allow-listed HTML5 game in a locked-down sandbox iframe.',
    kind: 'external',
    runtime: 'html5',
  },
  {
    id: 'flash',
    title: 'FLASH VAULT',
    players: 'ANY',
    icon: '💾',
    color: 'red',
    description: 'Play a `.swf` through the self-hosted Ruffle WASM runtime.',
    kind: 'external',
    runtime: 'flash',
  },
];
