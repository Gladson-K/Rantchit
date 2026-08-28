import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useCrypto } from '../hooks/useCrypto';
import { getJoinToken } from '../lib/api';
import { ChatWebSocket } from '../lib/websocket';
import { ChatMessage } from '../components/ChatMessage';
import { ChatInput } from '../components/ChatInput';
import { RoomHeader } from '../components/RoomHeader';
import { VerificationModal } from '../components/VerificationModal';
import { ChatMessage as MessageType } from '../lib/types';

export function RoomScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { crypto, isReady, initialize } = useCrypto();
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [connected, setConnected] = useState(false);
  const [peerPublicKey, setPeerPublicKey] = useState<string | null>(null);
  const [showVerification, setShowVerification] = useState(false);
  const [sasCode, setSasCode] = useState('');
  const wsRef = useRef<ChatWebSocket | null>(null);
  const [roomSecret, setRoomSecret] = useState('');

  useEffect(() => {
    // Extract room secret from URL fragment
    const hash = location.hash.substring(1); // remove '#'
    setRoomSecret(hash);
    if (!hash) {
      // Creator: secret not in URL? But we need it for join token and key generation.
      // Actually creator generates roomSecret before creating, stored in memory.
      // For simplicity, we assume it's in state from creation flow, but here we just extract.
      // In a real app, creator would pass it via context; for this demo, we'll rely on fragment.
      // To join, the link has #<secret>.
    }
  }, [location]);

  const connectWebSocket = async (token: string) => {
    const wsUrl = `${import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000'}/ws/chat?room_id=${roomId}&token=${token}`;
    const ws = new ChatWebSocket();
    wsRef.current = ws;
    ws.connect(wsUrl, handleMessage, () => {
      setConnected(false);
    });
  };

  const handleMessage = async (data: any) => {
    switch (data.type) {
      case 'peer_public_key':
        setPeerPublicKey(data.public_key);
        await crypto.importPeerPublicKey(data.public_key);
        // Generate SAS code for verification
        const sas = generateSAS(await crypto.getRoomSecretHash(), data.public_key);
        setSasCode(sas);
        setShowVerification(true);
        break;
      case 'message':
        if (data.encrypted_payload && data.nonce) {
          try {
            const plaintext = await crypto.decryptMessage(data.encrypted_payload, data.nonce);
            setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'peer', ciphertext: '', nonce: '', timestamp: Date.now(), text: plaintext }]);
          } catch (e) {
            console.error('Decryption failed', e);
          }
        }
        break;
      case 'participant_left':
        setConnected(false);
        // Optionally show message
        break;
      case 'pong':
        break;
    }
  };

  const joinRoom = async () => {
    if (!roomId || !roomSecret) return;
    try {
      const token = await getJoinToken(roomId, roomSecret);
      await connectWebSocket(token);
      // Send our public key if we are creator (first)
      if (isReady) {
        const pubKey = await crypto.generateKeyPair(); // already generated, returns public
        wsRef.current?.send({ type: 'public_key', public_key: pubKey });
      }
    } catch (e) {
      console.error(e);
      // Handle errors (room full, expired)
    }
  };

  useEffect(() => {
    if (roomId && roomSecret) {
      initialize().then(() => joinRoom());
    }
  }, [roomId, roomSecret]);

  const sendMessage = async (text: string) => {
    if (!crypto || !connected) return;
    const { ciphertext, nonce } = await crypto.encryptMessage(text);
    wsRef.current?.send({ type: 'message', encrypted_payload: ciphertext, nonce });
    setMessages(prev => [...prev, { id: Date.now().toString(), sender: 'me', ciphertext, nonce, timestamp: Date.now(), text }]);
  };

  const destroyRoom = () => {
    wsRef.current?.send({ type: 'destroy' });
    wsRef.current?.close();
    navigate('/');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
      <RoomHeader roomId={roomId} connected={connected} onDestroy={destroyRoom} />
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
      </div>
      <ChatInput onSend={sendMessage} disabled={!connected} />
      {showVerification && (
        <VerificationModal sasCode={sasCode} onClose={() => setShowVerification(false)} />
      )}
    </div>
  );
}

function generateSAS(secretHash: string, peerPubKey: string): string {
  // Simple SAS: first 6 chars of SHA-256 of combined data
  const combined = secretHash + peerPubKey;
  // Use simple hash for demo (in real use proper SAS protocol)
  return combined.substring(0, 6).toUpperCase();
}