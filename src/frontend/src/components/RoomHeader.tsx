import React, { useState } from 'react';
import { ConnectionStatus } from './ConnectionStatus';
import { ConnectionStatusType } from '../lib/types';

interface RoomHeaderProps {
  roomId?: string;
  status: ConnectionStatusType;
  participantCount?: number;
  hasSharedKey?: boolean;
  formattedTime?: string;
  isUrgent?: boolean;
  isVerified?: boolean;
  onOpenVerify?: () => void;
  onOpenInvite?: () => void;
  onDestroy: () => void;
  onLeave: () => void;
}

export function RoomHeader({
  roomId,
  status,
  participantCount = 1,
  hasSharedKey = false,
  formattedTime,
  isUrgent = false,
  isVerified = false,
  onOpenVerify,
  onOpenInvite,
  onDestroy,
  onLeave
}: RoomHeaderProps) {
  const [showConfirmDestroy, setShowConfirmDestroy] = useState(false);

  return (
    <header className="bg-[#111827]/90 border-b border-slate-800 backdrop-blur-md px-4 py-3 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand & Room ID */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-brand-900/30">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-tight leading-none flex items-center gap-1.5">
                Rantchit
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  E2EE
                </span>
              </h1>
              {roomId && (
                <div className="text-[11px] font-mono text-slate-400 truncate max-w-[120px] sm:max-w-[200px]">
                  ID: {roomId.slice(0, 8)}...
                </div>
              )}
            </div>
          </div>

          <ConnectionStatus 
            status={status} 
            participantCount={participantCount} 
            hasSharedKey={hasSharedKey} 
          />
        </div>

        {/* Right: Actions (Timer, Verify, Invite, Destroy) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Expiration countdown */}
          {formattedTime && (
            <div 
              title="Time remaining until room auto-expires and erases all server metadata"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border ${
                isUrgent
                  ? 'bg-rose-500/15 text-rose-400 border-rose-500/40 glow-rose animate-pulse'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700/60'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formattedTime}</span>
            </div>
          )}

          {/* Verification SAS Button */}
          {hasSharedKey && onOpenVerify && (
            <button
              onClick={onOpenVerify}
              title="Verify cryptographic Short Authentication String"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                isVerified
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="hidden sm:inline">{isVerified ? 'Verified' : 'Verify SAS'}</span>
            </button>
          )}

          {/* Invite Peer Button */}
          {onOpenInvite && (
            <button
              onClick={onOpenInvite}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Invite Link</span>
            </button>
          )}

          {/* Destroy Room (Nuke) */}
          {showConfirmDestroy ? (
            <div className="flex items-center gap-1 bg-rose-950/80 border border-rose-600/50 rounded-lg p-0.5">
              <button
                onClick={() => {
                  onDestroy();
                  setShowConfirmDestroy(false);
                }}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-bold transition-colors"
              >
                Nuke Now!
              </button>
              <button
                onClick={() => setShowConfirmDestroy(false)}
                className="px-2 py-1 text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmDestroy(true)}
              title="Permanently destroy this room for all participants immediately"
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="hidden md:inline">Destroy</span>
            </button>
          )}

          {/* Leave Room Button */}
          <button
            onClick={onLeave}
            title="Leave conversation and return to home"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
