import { Room } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function createRoom(roomSecretHash: string, expiresInMinutes: number): Promise<Room> {
  const response = await fetch(`${API_BASE}/api/v1/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_secret_hash: roomSecretHash, expires_in_minutes: expiresInMinutes })
  });
  if (!response.ok) throw new Error('Failed to create room');
  return response.json();
}

export async function getJoinToken(roomId: string, roomSecret: string): Promise<string> {
  const response = await fetch(`${API_BASE}/api/v1/rooms/${roomId}/join-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_secret: roomSecret })
  });
  if (!response.ok) throw new Error('Failed to get join token');
  const data = await response.json();
  return data.token;
}