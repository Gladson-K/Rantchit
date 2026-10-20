import React from 'react';
import { ConnectionStatusType } from '../lib/types';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  participantCount?: number;
  hasSharedKey?: boolean;
  maxParticipants?: number;
}

export function ConnectionStatus({
  status,
  participantCount = 1,
  hasSharedKey = false,
  maxParticipants = 2,
}: ConnectionStatusProps) {
  let color = 'text-arcade-yellow border-arcade-yellow/40';
  let led = 'text-arcade-yellow animate-pulse';
  let label = 'Connecting...';

  const group = maxParticipants > 2;

  if (status === 'security_alert') {
    color = 'text-arcade-red border-arcade-red/50';
    led = 'text-arcade-red animate-blink';
    label = 'MITM Detected';
  } else if (status === 'confirmed') {
    color = 'text-arcade-green border-arcade-green/50';
    led = 'text-arcade-green';
    label = group
      ? `Secure (${participantCount}/${maxParticipants})`
      : 'Confirmed (2/2)';
  } else if (status === 'group_ready') {
    color = 'text-arcade-green border-arcade-green/50';
    led = 'text-arcade-green';
    label = `Secure (${participantCount}/${maxParticipants})`;
  } else if (status === 'destroyed') {
    color = 'text-arcade-red border-arcade-red/50';
    led = 'text-arcade-red';
    label = 'Room Destroyed';
  } else if (status === 'disconnected') {
    color = 'text-arcade-red border-arcade-red/40';
    led = 'text-arcade-red';
    label = 'Disconnected';
  } else if (hasSharedKey || status === 'keys_exchanged') {
    color = 'text-arcade-green border-arcade-green/50';
    led = 'text-arcade-green';
    label = group ? `Securing (${participantCount}/${maxParticipants})` : 'E2EE Secured (2/2)';
  } else if (status === 'peer_joined' || participantCount >= 2) {
    color = 'text-arcade-cyan border-arcade-cyan/40';
    led = 'text-arcade-cyan animate-pulse';
    label = 'Exchanging Keys...';
  } else if (status === 'connected' || status === 'waiting_peer') {
    color = 'text-arcade-purple border-arcade-purple/40';
    led = 'text-arcade-purple animate-pulse';
    label = group
      ? `Waiting (${participantCount}/${maxParticipants})`
      : 'Waiting for peer (1/2)';
  }

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 border-2 bg-arcade-deep font-pixel text-[8px] uppercase tracking-wider ${color}`}
    >
      <span className={`led ${led}`} />
      <span>{label}</span>
    </div>
  );
}
