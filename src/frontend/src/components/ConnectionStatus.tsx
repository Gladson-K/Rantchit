import React from 'react';
import { ConnectionStatusType } from '../lib/types';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  participantCount?: number;
  hasSharedKey?: boolean;
}

export function ConnectionStatus({ status, participantCount = 1, hasSharedKey = false }: ConnectionStatusProps) {
  let badgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/30";
  let dotStyle = "bg-amber-400 animate-ping";
  let label = "Connecting...";

  if (status === 'destroyed') {
    badgeStyle = "bg-rose-500/15 text-rose-400 border-rose-500/40 glow-rose";
    dotStyle = "bg-rose-500";
    label = "Room Destroyed";
  } else if (status === 'disconnected') {
    badgeStyle = "bg-red-500/10 text-red-400 border-red-500/30";
    dotStyle = "bg-red-500";
    label = "Disconnected";
  } else if (hasSharedKey || status === 'keys_exchanged') {
    badgeStyle = "bg-emerald-500/15 text-emerald-400 border-emerald-500/40 glow-emerald";
    dotStyle = "bg-emerald-400";
    label = "E2EE Secured (2/2)";
  } else if (status === 'peer_joined' || participantCount >= 2) {
    badgeStyle = "bg-cyan-500/15 text-cyan-400 border-cyan-500/30";
    dotStyle = "bg-cyan-400 animate-pulse";
    label = "Exchanging Keys...";
  } else if (status === 'connected' || status === 'waiting_peer') {
    badgeStyle = "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
    dotStyle = "bg-indigo-400 animate-pulse";
    label = "Waiting for peer (1/2)";
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border backdrop-blur-sm transition-all duration-300 ${badgeStyle}`}>
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${dotStyle}`}></span>
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotStyle.replace('animate-ping', '').replace('animate-pulse', '')}`}></span>
      </span>
      <span>{label}</span>
    </div>
  );
}
