import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCrypto } from '../hooks/useCrypto';
import { createRoom } from '../lib/api';

export function HomeScreen() {
  const { crypto, isReady, initialize } = useCrypto();
  const [alias, setAlias] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const navigate = useNavigate();

  const generateAlias = () => {
    const adjectives = ['Swift', 'Silent', 'Mystic', 'Brave', 'Clever'];
    const nouns = ['Fox', 'River', 'Mountain', 'Star', 'Wolf'];
    setAlias(`${adjectives[Math.floor(Math.random()*adjectives.length)]} ${nouns[Math.floor(Math.random()*nouns.length)]}`);
  };

  const handleCreateRoom = async () => {
    if (!alias.trim()) return;
    setLoading(true);
    try {
      await initialize();
      const roomSecret = await crypto.generateRoomSecret();
      const secretHash = await crypto.getRoomSecretHash();
      const room = await createRoom(secretHash, 60);
      const link = `${window.location.origin}/room/${room.roomId}#${roomSecret}`;
      setInviteLink(link);
      // Optionally auto-navigate after copy
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">VeilChat</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Temporary alias</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Choose a name"
              />
              <button
                onClick={generateAlias}
                className="mt-1 px-3 py-2 bg-gray-200 dark:bg-gray-600 rounded-md"
              >
                Generate
              </button>
            </div>
          </div>
          <button
            onClick={handleCreateRoom}
            disabled={loading || !alias.trim()}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Private Room'}
          </button>
          {inviteLink && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Share this link (single use)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="mt-1 px-3 py-2 bg-gray-200 dark:bg-gray-600 rounded-md"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}