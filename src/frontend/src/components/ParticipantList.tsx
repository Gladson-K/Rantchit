import React from 'react';
import { Peer } from '../lib/types';

interface ParticipantListProps {
  peers: Peer[];
  selfId: string | null;
  selfAlias: string;
  maxParticipants: number;
  speaking?: Record<string, boolean>;
  onPeerClick?: (peerId: string) => void;
}

export function ParticipantList({
  peers,
  selfId,
  selfAlias,
  maxParticipants,
  speaking = {},
  onPeerClick,
}: ParticipantListProps) {
  const roster = peers.length
    ? peers
    : selfId
      ? [{ peerId: selfId, alias: selfAlias, isHost: true, hasKey: false }]
      : [];

  return (
    <div className="retro-panel p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="retro-label">Players</span>
        <span className="font-pixel text-[8px] text-arcade-cyan">
          {roster.length}/{maxParticipants}
        </span>
      </div>

      <div className="space-y-1.5">
        {roster.map((p) => {
          const isSelf = p.peerId === selfId;
          const isSpeaking = !!speaking[p.peerId];
          return (
            <button
              key={p.peerId}
              onClick={() => !isSelf && onPeerClick?.(p.peerId)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 border-2 text-left transition-colors ${
                isSpeaking
                  ? 'border-arcade-green bg-arcade-green/10'
                  : 'border-arcade-border bg-arcade-deep hover:border-arcade-cyan/60'
              }`}
            >
              <span className={`led ${p.hasKey ? 'text-arcade-green' : 'text-arcade-muted'}`} />
              <span className="flex-1 truncate font-term text-base text-arcade-text">
                {isSelf ? `${selfAlias} (you)` : p.alias || p.peerId}
              </span>
              {p.isHost && <span title="Host" className="text-arcade-yellow text-xs">&#9733;</span>}
              <span className="font-pixel text-[7px] text-arcade-muted">
                {p.peerId.replace('p_', '').slice(0, 4)}
              </span>
            </button>
          );
        })}

        {Array.from({ length: Math.max(0, maxParticipants - roster.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex items-center gap-2 px-2.5 py-2 border-2 border-dashed border-arcade-border/60"
          >
            <span className="led text-arcade-border" />
            <span className="font-term text-base text-arcade-muted/60 animate-blink">
              waiting for player...
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
