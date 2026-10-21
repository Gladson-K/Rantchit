import React, { useEffect, useRef } from 'react';
import { RetroButton } from './RetroUI';
import { Peer, VoiceState } from '../lib/types';

interface VoicePanelProps {
  voiceState: VoiceState;
  muted: boolean;
  error?: string | null;
  peers: Peer[];
  selfId: string | null;
  remoteStreams: Record<string, MediaStream>;
  speaking: Record<string, boolean>;
  onStart: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  /** Voice requires the E2E session key, so it stays disabled until ready. */
  disabled?: boolean;
  disabledReason?: string;
  /** True when a TURN server is configured (better NAT traversal). */
  turnConfigured?: boolean;
}

function RemoteAudio({ peerId, stream }: { peerId: string; stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => undefined);
    }
  }, [stream]);
  return <audio ref={ref} autoPlay data-peer={peerId} />;
}

export function VoicePanel({
  voiceState,
  muted,
  error,
  peers,
  selfId,
  remoteStreams,
  speaking,
  onStart,
  onStop,
  onToggleMute,
  disabled = false,
  disabledReason,
  turnConfigured = false,
}: VoicePanelProps) {
  const live = voiceState === 'live';
  const busy = voiceState === 'requesting' || voiceState === 'connecting';

  return (
    <div className="space-y-4">
      {/* Hidden audio sinks for each remote peer */}
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <RemoteAudio key={peerId} peerId={peerId} stream={stream} />
      ))}

      <div className="retro-panel p-5 text-center space-y-3">
        <div className="text-5xl">{live ? '🎙️' : '🔇'}</div>
        <h3 className="font-pixel text-[11px] uppercase tracking-widest text-arcade-cyan">
          Voice Channel
        </h3>
        <p className="font-term text-lg text-arcade-muted max-w-md mx-auto leading-snug">
          {voiceState === 'idle' && 'Push-to-join encrypted voice. Your browser will ask for microphone permission.'}
          {voiceState === 'requesting' && 'Requesting microphone permission...'}
          {voiceState === 'connecting' && 'Negotiating peer-to-peer audio...'}
          {voiceState === 'live' && 'Live. Audio flows peer-to-peer (DTLS-SRTP); the relay only sees encrypted signalling.'}
          {voiceState === 'denied' && 'Microphone permission was denied. Enable it in your browser settings to talk.'}
          {voiceState === 'error' && 'Voice failed to start.'}
        </p>

        {error && (
          <div className="retro-inset border-2 border-arcade-red/60 text-arcade-red p-2 text-xs font-term text-base">
            {error}
          </div>
        )}

        {!live && disabled && (
          <div className="retro-inset border-2 border-arcade-amber/60 text-arcade-amber p-2 text-xs font-term text-base">
            {disabledReason || 'Voice unlocks once the encrypted session is ready.'}
          </div>
        )}

        {!turnConfigured && (
          <p className="font-term text-sm text-arcade-muted/70">
            STUN only — if audio never connects behind strict NATs, configure a TURN server (see docs/BOTTLENECKS.md).
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          {!live ? (
            <RetroButton variant="green" onClick={onStart} disabled={busy || disabled}>
              {busy ? 'Connecting...' : 'START VOICE'}
            </RetroButton>
          ) : (
            <>
              <RetroButton variant={muted ? 'red' : 'cyan'} onClick={onToggleMute}>
                {muted ? 'UNMUTE' : 'MUTE'}
              </RetroButton>
              <RetroButton variant="red" onClick={onStop}>
                LEAVE VOICE
              </RetroButton>
            </>
          )}
        </div>
      </div>

      {/* Speaking roster */}
      <div className="retro-panel p-3 space-y-2">
        <span className="retro-label">In Channel</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {selfId && (
            <div
              className={`flex items-center gap-2 px-2.5 py-2 border-2 font-term text-base ${
                live && !muted && speaking[selfId]
                  ? 'border-arcade-green bg-arcade-green/10 text-arcade-green'
                  : 'border-arcade-border text-arcade-text'
              }`}
            >
              <span className={`led ${live && !muted ? 'text-arcade-green' : 'text-arcade-muted'}`} />
              You
            </div>
          )}
          {peers
            .filter((p) => p.peerId !== selfId)
            .map((p) => (
              <div
                key={p.peerId}
                className={`flex items-center gap-2 px-2.5 py-2 border-2 font-term text-base ${
                  speaking[p.peerId]
                    ? 'border-arcade-green bg-arcade-green/10 text-arcade-green'
                    : 'border-arcade-border text-arcade-text'
                }`}
              >
                <span className={`led ${speaking[p.peerId] ? 'text-arcade-green' : 'text-arcade-muted'}`} />
                <span className="truncate">{p.alias || p.peerId}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
