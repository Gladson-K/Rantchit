import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrypto } from '../hooks/useCrypto';
import { useRoom } from '../hooks/useRoom';
import { InviteModal } from '../components/InviteModal';
import { EXPIRY_OPTIONS, DEFAULT_EXPIRY_MINUTES } from '../lib/constants';

const ADJECTIVES = ['Silent', 'Swift', 'Mystic', 'Cosmic', 'Shadow', 'Quantum', 'Hyper', 'Neon', 'Brave', 'Astral'];
const NOUNS = ['Fox', 'Falcon', 'Wolf', 'Cipher', 'Vortex', 'Sentinel', 'Pulse', 'Specter', 'Mirage', 'Apex'];

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
  const [createdInviteUrl, setCreatedInviteUrl] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  const generateNewAlias = () => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    setAlias(`${adj} ${noun}`);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Generate 32-byte cryptographically secure room secret in memory
      const roomSecret = await crypto.generateRoomSecret();
      const secretHash = await crypto.getRoomSecretHash();

      // 2. Register room with backend (sending only SHA-256 hash)
      const room = await createRoom(secretHash, expiresIn);

      // 3. Construct shareable link with room secret in fragment
      const inviteUrl = `${window.location.origin}/room/${room.roomId}#${roomSecret}`;
      
      // Save alias to sessionStorage for room display
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
        // Full URL or path with fragment
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
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-between selection:bg-brand-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-[#0d1322]/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-lg shadow-brand-900/40">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            </div>
            <div>
              <span className="text-lg font-extrabold tracking-tight text-white">Rantchit</span>
              <span className="ml-2 text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                Zero-Knowledge E2EE
              </span>
            </div>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
            <span>v1.0</span>
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-10 sm:py-16 flex flex-col items-center flex-1 justify-center">
        {/* Hero title */}
        <div className="text-center max-w-2xl mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-300 text-xs font-semibold uppercase tracking-wider glow-brand">
            <span>⚡ Single-Use Encrypted Rooms</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Chat with Randomness, <br className="hidden sm:inline" />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-400 via-indigo-300 to-purple-400">
              Zero Plaintext Left Behind.
            </span>
          </h1>
          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            Instant 1-on-1 private conversations protected by WebCrypto (ECDH + AES-GCM-256). 
            No sign-ups, no message history, strict 2-party isolation, and one-click room destruction.
          </p>
        </div>

        {/* Action Cards Container */}
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Card 1: Create Room */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-700/60 shadow-2xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-brand-600/10 rounded-full blur-3xl -z-10 group-hover:bg-brand-600/20 transition-all"></div>
            
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Create Private Room</h2>
                  <p className="text-xs text-slate-400">Generate an ephemeral end-to-end encrypted room</p>
                </div>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-rose-950/50 border border-rose-600/50 rounded-xl text-rose-300 text-xs">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateRoom} className="space-y-4">
                {/* Temporary Alias */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Your Temporary Alias
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={alias}
                      onChange={(e) => setAlias(e.target.value)}
                      maxLength={30}
                      className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="Enter an alias"
                      required
                    />
                    <button
                      type="button"
                      onClick={generateNewAlias}
                      title="Generate random alias"
                      className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium border border-slate-700 transition-colors shrink-0"
                    >
                      🎲 Roll
                    </button>
                  </div>
                </div>

                {/* Expiry Lifetime */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Room Lifetime (Auto-Destruct)
                  </label>
                  <select
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(Number(e.target.value))}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading || !alias.trim()}
                  className="w-full mt-2 py-3.5 px-4 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold text-sm transition-all shadow-xl shadow-brand-950/40 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Initializing Cryptography...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <span>Create Encrypted Room</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Card 2: Join Existing Room */}
          <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-700/60 shadow-2xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-600/10 rounded-full blur-3xl -z-10 group-hover:bg-indigo-600/20 transition-all"></div>

            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Join Existing Room</h2>
                  <p className="text-xs text-slate-400">Paste an invitation link received from your peer</p>
                </div>
              </div>

              {joinError && (
                <div className="mb-4 p-3 bg-rose-950/50 border border-rose-600/50 rounded-xl text-rose-300 text-xs">
                  {joinError}
                </div>
              )}

              <form onSubmit={handleJoinFromInput} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    Invitation URL
                  </label>
                  <input
                    type="text"
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm font-mono text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-600"
                    placeholder="https://.../room/uuid#secret"
                    required
                  />
                  <span className="block text-[11px] text-slate-500 mt-1">
                    Paste the entire link with the # fragment key
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!joinInput.trim()}
                  className="w-full py-3.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-xl font-semibold text-sm border border-slate-700 transition-all flex items-center justify-center gap-2 mt-auto"
                >
                  <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>Connect to Room</span>
                </button>
              </form>
            </div>

            {/* Privacy highlights */}
            <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-left">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                <span>Zero Server Plaintext</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                <span>Max 2 Participants</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="w-full max-w-4xl mt-16 grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="p-5 bg-[#0d1322]/60 border border-slate-800 rounded-2xl">
            <div className="text-brand-400 text-lg mb-2">🔐</div>
            <h3 className="text-sm font-semibold text-white mb-1">ECDH & AES-256-GCM</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Every room establishes a fresh ephemeral session key using native Web Crypto APIs.
            </p>
          </div>

          <div className="p-5 bg-[#0d1322]/60 border border-slate-800 rounded-2xl">
            <div className="text-emerald-400 text-lg mb-2">🔍</div>
            <h3 className="text-sm font-semibold text-white mb-1">SAS Visual Verification</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Compare a 6-digit code or visual emoji fingerprint to verify peer authenticity and defeat MITM.
            </p>
          </div>

          <div className="p-5 bg-[#0d1322]/60 border border-slate-800 rounded-2xl">
            <div className="text-rose-400 text-lg mb-2">💣</div>
            <h3 className="text-sm font-semibold text-white mb-1">Instant Room Nuke</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Click Destroy to instantly terminate all WebSockets and erase Redis keys and DB records.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0d1322]/80 py-4 px-6 text-center text-xs text-slate-500">
        Rantchit — Privacy-first zero-knowledge ephemeral messaging platform.
      </footer>

      {/* Invite Modal for newly created room */}
      {createdInviteUrl && (
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => {
            setShowInviteModal(false);
            proceedToRoom();
          }}
          inviteUrl={createdInviteUrl}
        />
      )}
    </div>
  );
}