import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrypto } from '../hooks/useCrypto';
import { useRoom } from '../hooks/useRoom';
import { InviteModal } from '../components/InviteModal';
import { Marquee, RetroButton, RetroWindow } from '../components/RetroUI';
import {
  EXPIRY_OPTIONS,
  DEFAULT_EXPIRY_MINUTES,
  PARTICIPANT_OPTIONS,
  DEFAULT_MAX_PARTICIPANTS,
} from '../lib/constants';

const ADJECTIVES = ['Silent', 'Swift', 'Mystic', 'Cosmic', 'Shadow', 'Quantum', 'Hyper', 'Neon', 'Brave', 'Astral'];
const NOUNS = ['Fox', 'Falcon', 'Wolf', 'Cipher', 'Vortex', 'Sentinel', 'Pulse', 'Specter', 'Mirage', 'Apex'];

type RoomMode = 'private' | 'lounge';

export function HomeScreen() {
  const navigate = useNavigate();
  const { crypto } = useCrypto();
  const { createRoom, loading, error } = useRoom();

  const [alias, setAlias] = useState(() => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${adj} ${noun}`;
  });

  const [expiresIn, setExpiresIn] = useState<number>(DEFAULT_EXPIRY_MINUTES);
  const [mode, setMode] = useState<RoomMode>('private');
  const [maxParticipants, setMaxParticipants] = useState<number>(DEFAULT_MAX_PARTICIPANTS);
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const generateNewAlias = () => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    setAlias(`${adj} ${noun}`);
  };

  const effectiveMax = mode === 'private' ? 2 : Math.max(3, maxParticipants);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const roomSecret = await crypto.generateRoomSecret();
      const secretHash = await crypto.getRoomSecretHash();

      const room = await createRoom(secretHash, expiresIn, effectiveMax);

      const inviteUrl = `${window.location.origin}/room/${room.roomId}#${roomSecret}`;
      sessionStorage.setItem('rantchit_alias', alias);

      setCreatedInviteUrl(inviteUrl);
      setShowInviteModal(true);
    } catch (err: any) {
      console.error('Failed to create room:', err);
    }
  };

  const handleJoinFromInput = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const trimmed = joinInput.trim();
    if (!trimmed) return;

    try {
      sessionStorage.setItem('rantchit_alias', alias);

      if (trimmed.includes('#')) {
        const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `http://dummy.com/${trimmed}`);
        const pathParts = urlObj.pathname.split('/').filter(Boolean);
        const roomId = pathParts[pathParts.length - 1];
        const secret = urlObj.hash.replace('#', '');

        if (roomId && secret) {
          navigate(`/room/${roomId}#${secret}`);
          return;
        }
      }

      setJoinError('Invalid invitation link. Link must contain a valid Room ID and #secret fragment.');
    } catch {
      setJoinError('Could not parse invitation URL. Please check the link format.');
    }
  };

  const proceedToRoom = () => {
    if (createdInviteUrl) {
      const url = new URL(createdInviteUrl);
      navigate(`${url.pathname}${url.hash}`);
    }
  };

  return (
    <div className="min-h-screen bg-arcade-bg text-arcade-text flex flex-col justify-between">
      <header className="border-b-3 border-arcade-border bg-arcade-deep px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="font-pixel text-[14px] neon-green">RANTCHIT</span>
            <span className="font-pixel text-[7px] px-1.5 py-0.5 border-2 border-arcade-cyan text-arcade-cyan">
              ZERO-KNOWLEDGE E2EE
            </span>
          </div>
          <span className="font-pixel text-[8px] text-arcade-muted">v2.0 ARCADE</span>
        </div>
      </header>

      <Marquee
        items={[
          'END-TO-END ENCRYPTED',
          'NO SIGN-UP',
          'VOICE + RETRO GAMES',
          'ROOMS SELF-DESTRUCT',
          'SERVER SEES NOTHING',
        ]}
      />

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-12 flex flex-col items-center flex-1 w-full">
        <div className="text-center max-w-2xl mb-10 space-y-4">
          <div className="inline-block px-3 py-1.5 border-2 border-arcade-magenta text-arcade-magenta font-pixel text-[8px] uppercase">
            ⚡ Single-Use Encrypted Rooms
          </div>
          <h1 className="text-3xl sm:text-4xl font-pixel text-arcade-green leading-relaxed neon-green">
            INSERT COIN TO CHAT
          </h1>
          <p className="text-sm text-arcade-muted leading-relaxed font-term text-lg">
            End-to-end encrypted rooms with built-in voice chat and a retro arcade. No sign-ups, no message
            history, one-click room destruction.
          </p>
        </div>

        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* Create */}
          <RetroWindow title="Create Room" className="flex flex-col">
            <div className="space-y-3.5">
              {error && (
                <div className="p-3 border-2 border-arcade-red text-arcade-red text-xs font-term text-base">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateRoom} className="space-y-3.5">
                <div>
                  <label className="block retro-label mb-1.5">Your Alias</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                      maxLength={30}
                      className="retro-input"
                      placeholder="Enter an alias"
                      required
                    />
                    <RetroButton
                      type="button"
                      onClick={generateNewAlias}
                      title="Roll a random alias"
                      className="whitespace-nowrap"
                    >
                      ROLL
                    </RetroButton>
                  </div>
                </div>

                <div>
                  <label className="block retro-label mb-1.5">Room Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode('private')}
                      className={`font-pixel text-[8px] uppercase py-2.5 border-2 transition-colors ${
                        mode === 'private'
                          ? 'border-arcade-green text-arcade-green bg-arcade-green/10'
                          : 'border-arcade-border text-arcade-muted'
                      }`}
                    >
                      Private 1:1
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('lounge')}
                      className={`font-pixel text-[8px] uppercase py-2.5 border-2 transition-colors ${
                        mode === 'lounge'
                          ? 'border-arcade-cyan text-arcade-cyan bg-arcade-cyan/10'
                          : 'border-arcade-border text-arcade-muted'
                      }`}
                    >
                      Arcade Lounge
                    </button>
                  </div>
                </div>

                {mode === 'lounge' && (
                  <div>
                    <label className="block retro-label mb-1.5">Max Players (incl. host)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PARTICIPANT_OPTIONS.filter((n) => n >= 3).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setMaxParticipants(n)}
                          className={`w-9 h-9 border-2 font-pixel text-[10px] ${
                            maxParticipants === n
                              ? 'border-arcade-green text-arcade-green bg-arcade-green/10'
                              : 'border-arcade-border text-arcade-muted'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block retro-label mb-1.5">Auto-Destruct TTL</label>
                  <select
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(Number(e.target.value))}
                    className="retro-input font-term text-base"
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <RetroButton
                  type="submit"
                  variant="green"
                  disabled={loading || !alias.trim()}
                  className="w-full !py-3"
                >
                  {loading ? 'INITIALIZING CRYPTO...' : 'CREATE ENCRYPTED ROOM'}
                </RetroButton>
              </form>
            </div>
          </RetroWindow>

          {/* Join */}
          <RetroWindow title="Join Room" className="flex flex-col">
            <div className="flex flex-col h-full">
              {joinError && (
                <div className="mb-3 p-3 border-2 border-arcade-red text-arcade-red text-xs font-term text-base">
                  {joinError}
                </div>
              )}

              <form onSubmit={handleJoinFromInput} className="space-y-3.5 flex-1">
                <div>
                  <label className="block retro-label mb-1.5">Invitation URL</label>
                  <input
                    type="text"
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                    className="retro-input text-xs font-mono"
                    placeholder="https://.../room/uuid#secret"
                    required
                  />
                  <span className="block text-[11px] text-arcade-muted mt-1 font-term text-base">
                    Paste the entire link including the # fragment key
                  </span>
                </div>

                <RetroButton type="submit" variant="cyan" disabled={!joinInput.trim()} className="w-full !py-3">
                  CONNECT TO ROOM
                </RetroButton>
              </form>

              <div className="mt-5 pt-4 border-t-2 border-arcade-border grid grid-cols-2 gap-2 font-term text-base">
                <span className="text-arcade-green">▸ Zero server plaintext</span>
                <span className="text-arcade-green">▸ E2EE voice</span>
                <span className="text-arcade-green">▸ Retro arcade</span>
                <span className="text-arcade-green">▸ Ephemeral</span>
              </div>
            </div>
          </RetroWindow>
        </div>

        {/* Feature grid */}
        <div className="w-full max-w-4xl mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: '🔐', title: 'ECDH + AES-256-GCM', body: 'Every room establishes a fresh ephemeral session key with native Web Crypto.' },
            { icon: '🎙️', title: 'P2P Voice', body: 'WebRTC audio flows directly between peers; the relay only sees encrypted signalling.' },
            { icon: '🕹️', title: 'Arcade Mode', body: 'Play Pixel Snake solo or duel a friend at Tic-Tac-Toe over the encrypted relay.' },
          ].map((f) => (
            <div key={f.title} className="retro-panel p-4">
              <div className="text-2xl mb-2">{f.icon}</div>
              <h3 className="font-pixel text-[9px] text-arcade-text mb-2">{f.title}</h3>
              <p className="text-xs text-arcade-muted font-term text-base leading-snug">{f.body}</p>
            </div>
          ))}
        </div>
      </main>

      <Marquee
        items={['PRESS START', 'STAY PRIVATE', 'PLAY TOGETHER', 'ROOMS DIE WHEN THEY EXPIRE']}
      />

      <footer className="border-t-3 border-arcade-border bg-arcade-deep py-3 px-4 text-center">
        <span className="font-pixel text-[8px] text-arcade-muted">
          RANTCHIT — ZERO-KNOWLEDGE EPHEMERAL MESSAGING PLATFORM
        </span>
      </footer>

      {createdInviteUrl && (
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => {
            setShowInviteModal(false);
            proceedToRoom();
          }}
          inviteUrl={createdInviteUrl}
          maxParticipants={effectiveMax}
        />
      )}
    </div>
  );
}
