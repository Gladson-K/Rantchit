import { useState, useCallback } from 'react';
import { createRoom as apiCreateRoom, getRoomInfo as apiGetRoomInfo, getJoinToken as apiGetJoinToken, destroyRoom as apiDestroyRoom } from '../lib/api';
import { Room, RoomInfo } from '../lib/types';

export function useRoom() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRoom = useCallback(async (secretHash: string, expiresInMinutes: number = 60): Promise<Room> => {
    setLoading(true);
    setError(null);
    try {
      const room = await apiCreateRoom(secretHash, expiresInMinutes);
      return room;
    } catch (err: any) {
      const msg = err.message || 'Failed to create room';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getRoomInfo = useCallback(async (roomId: string): Promise<RoomInfo> => {
    setLoading(true);
    setError(null);
    try {
      const info = await apiGetRoomInfo(roomId);
      return info;
    } catch (err: any) {
      const msg = err.message || 'Failed to fetch room status';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const getJoinToken = useCallback(async (roomId: string, roomSecret: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const token = await apiGetJoinToken(roomId, roomSecret);
      return token;
    } catch (err: any) {
      const msg = err.message || 'Failed to get join token';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const destroyRoom = useCallback(async (roomId: string, roomSecret: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      await apiDestroyRoom(roomId, roomSecret);
    } catch (err: any) {
      const msg = err.message || 'Failed to destroy room';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    createRoom,
    getRoomInfo,
    getJoinToken,
    destroyRoom
  };
}
