import React, { useState } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { RetroButton } from './RetroUI';
import { ConnectionStatusType, MkcStatus } from '../lib/types';

interface RoomHeaderProps {
  roomId?: string;
  status: ConnectionStatusType;
  participantCount?: number;
  maxParticipants?: number;
  hasSharedKey?: boolean;
  formattedTime?: string;
  isUrgent?: boolean;
  isVerified?: boolean;
  mkcStatus?: MkcStatus;
  onOpenVerify?: () => void;
  onOpenInvite?: () => void;
  onDestroy: () => void;
  onLeave: () => void;
}

export function RoomHeader({
  roomId,
  status,
  participantCount = 1,
  maxParticipants = 2,
  hasSharedKey = false,
  formattedTime,
  isUrgent = false,
  isVerified = false,
  mkcStatus = 'pending',
  onOpenVerify,
  onOpenInvite,
  onDestroy,
  onLeave
}: RoomHeaderProps) {
  const [showConfirmDestroy, setShowConfirmDestroy] = useState(false);

  return (
    <header className="bg-arcade-deep border-b-3 border-arcade-border px-3 py-2.5 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-pixel text-[13px] neon-green">RANTCHIT</span>
            <span className="font-pixel text-[7px] px-1.5 py-0.5 border-2 border-arcade-cyan text-arcade-cyan">
              E2EE
            </span>
          </div>
          {roomId && (
            <span className="font-mono text-[10px] text-arcade-muted hidden sm:inline">
              #{roomId.slice(0, 8)}
            </span>
          )}
          <ConnectionStatus
            status={status}
            participantCount={participantCount}
            hasSharedKey={hasSharedKey}
            maxParticipants={maxParticipants}
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
          {formattedTime && (
            <div
              title="Time until this room self-destructs"
              className={`px-2.5 py-1.5 border-2 font-pixel text-[9px] ${
                isUrgent
                  ? 'border-arcade-red text-arcade-red animate-blink'
                  : 'border-arcade-border text-arcade-yellow'
              }`}
            >
              T-{formattedTime}
            </div>
          )}

          {hasSharedKey && onOpenVerify && (
            <button
              onClick={onOpenVerify}
              title="Verify cryptographic fingerprint (SAS)"
              data-testid="verify-sas-btn"
              className={`retro-btn ${
                mkcStatus === 'failed' ? 'retro-btn-red' : isVerified ? 'retro-btn-green' : 'retro-btn-cyan'
              }`}
            >
              {isVerified ? 'VERIFIED' : 'VERIFY SAS'}
            </button>
          )}

          {onOpenInvite && (
            <RetroButton onClick={onOpenInvite}>INVITE</RetroButton>
          )}

          {showConfirmDestroy ? (
            <div className="flex items-center gap-1 border-2 border-arcade-red bg-arcade-deep p-0.5">
              <RetroButton
                variant="red"
                onClick={() => {
                  onDestroy();
                  setShowConfirmDestroy(false);
                }}
              >
                NUKE!
              </RetroButton>
              <button
                onClick={() => setShowConfirmDestroy(false)}
                className="px-2 py-1 text-arcade-muted hover:text-arcade-text font-pixel text-[8px]"
              >
                NO
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmDestroy(true)}
              title="Permanently destroy this room and all keys"
              className="retro-btn retro-btn-red"
            >
              DESTROY
            </button>
          )}

          <button
            onClick={onLeave}
            title="Leave and return home"
            className="retro-btn !px-2.5"
          >
            EXIT
          </button>
        </div>
      </div>
    </header>
  );
}
