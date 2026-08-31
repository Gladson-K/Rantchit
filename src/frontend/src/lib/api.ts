import { Room, RoomInfo } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export async function createRoom(roomSecretHash: string, expiresInMinutes: number = 60): Promise<Room> {
  const response = await fetch(`${API_BASE}/api/v1/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      room_secret_hash: roomSecretHash, 
      expires_in_minutes: expiresInMinutes 
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to create room' }));
    throw new Error(errorData.detail || `Server responded with ${response.status}`);
  }

  const data = await response.json();
  return {
    roomId: data.room_id,
    expiresAt: data.expires_at,
    maxParticipants: data.max_participants,
    status: data.status
  };
}

export async function getRoomInfo(roomId: string): Promise<RoomInfo> {
  const response = await fetch(`${API_BASE}/api/v1/rooms/${roomId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch room status' }));
    throw new Error(errorData.detail || `Server responded with ${response.status}`);
  }

  const data = await response.json();
  return {
    roomId: data.room_id,
    status: data.status,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    maxParticipants: data.max_participants,
    participantCount: data.participant_count,
    isExpired: data.is_expired
  };
}

export async function getJoinToken(roomId: string, roomSecret: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/v1/rooms/${roomId}/join-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_secret: roomSecret })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to obtain join token' }));
    throw new Error(errorData.detail || `Server responded with ${response.status}`);
  }

  const data = await response.json();
  return data.token;
}

export async function destroyRoom(roomId: string, roomSecret: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/rooms/${roomId}/destroy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_secret: roomSecret })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to destroy room' }));
    throw new Error(errorData.detail || `Server responded with ${response.status}`);
  }
}