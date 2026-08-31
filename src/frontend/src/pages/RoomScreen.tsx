import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useCrypto } from '../hooks/useCrypto';
import { useRoom } from '../hooks/useRoom';
import { useWebSocket } from '../hooks/useWebSocket';
import { useCountdown } from '../hooks/useCountdown';
import { RoomHeader } from '../components/RoomHeader';
import { ChatMessage } from '../components/ChatMessage';
import { ChatInput } from '../components/ChatInput';
import { VerificationModal } from '../components/VerificationModal';
import { InviteModal } from '../components/InviteModal';
import { generateSAS } from '../lib/sas';
import { ChatMessage as MessageType, RoomInfo, SASData } from '../lib/types';

export function RoomScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    crypto,
    publicKey,
    hasSharedKey,
    initialize: initCrypto,
    importPeerPublicKey,
    encrypt,
    decrypt
  } = useCrypto();

  const { getRoomInfo, getJoinToken, destroyRoom: apiDestroyRoom } = useRoom();
  const { status, participantCount, connect: connectWS, send: sendWS, close: closeWS } = useWebSocket();

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [sasData, setSasData] = useState<SASData | null>(null);
  const [isPeerVerified, setIsPeerVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [myAlias] = useState(() => sessionStorage.getItem('rantchit_alias') || 'You');

  const roomSecretRef = useRef<string>('');
  const secretHashRef = useRef<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isJoinedRef = useRef(false);

  // Auto-scroll to latest message
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Room Expiry Countdown
  const { formattedTime, isUrgent } = useCountdown(roomInfo?.expiresAt, () => {
    navigate('/error', {
      state: {
        title: 'Room Auto-Expired',
        message: 'This session reached its maximum time-to-live and was permanently wiped.'
      }
    });
  });

  // 1. Extract Room Secret from URL Fragment
  useEffect(() => {
    const hashSecret = location.hash.replace('#', '').trim();
    if (!hashSecret) {
      navigate('/error', {
        state: {
          title: 'Missing Encryption Key',
          message: 'The URL fragment (#secret) is missing. The room cannot be decrypted without the secret key.'
        }
      });
      return;
    }
    roomSecretRef.current = hashSecret;
    crypto.setRoomSecret(hashSecret);
    crypto.getRoomSecretHash().then(hash => {
      secretHashRef.current = hash;
    });
  }, [location, crypto, navigate]);

  // 2. Handle incoming WebSocket events
  const handleWsMessage = useCallback(async (data: any) => {
    switch (data.type) {
      case 'connected':
        // Connected to relay, send our ephemeral public key
        if (publicKey) {
          sendWS({ type: 'public_key', public_key: publicKey });
        }
        break;

      case 'peer_joined':
        setMessages(prev => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            sender: 'system',
            text: 'Peer connected to room. Exchanging cryptographic keys...',
            timestamp: Date.now()
          }
        ]);
        if (publicKey) {
          sendWS({ type: 'public_key', public_key: publicKey });
        }
        break;

      case 'peer_public_key':
        if (data.public_key) {
          try {
            await importPeerPublicKey(data.public_key);
            const secretHash = secretHashRef.current || (await crypto.getRoomSecretHash());
            const sas = await generateSAS(secretHash, data.public_key);
            setSasData(sas);

            setMessages(prev => [
              ...prev,
              {
                id: `sys-${Date.now()}`,
                sender: 'system',
                text: '🔒 End-to-end encrypted session established (ECDH P-256 + AES-GCM). Click "Verify SAS" to confirm peer identity.',
                timestamp: Date.now()
              }
            ]);
          } catch (e) {
            console.error('Failed to import peer public key:', e);
          }
        }
        break;

      case 'message':
        if (data.encrypted_payload && data.nonce) {
          try {
            const plaintext = await decrypt(data.encrypted_payload, data.nonce);
            setMessages(prev => [
              ...prev,
              {
                id: `msg-${Date.now()}-${Math.random()}`,
                sender: 'peer',
                text: plaintext,
                timestamp: Date.now(),
                isVerified: isPeerVerified
              }
            ]);
          } catch (err) {
            console.error('Decryption failed for incoming message:', err);
          }
        }
        break;

      case 'participant_left':
        setMessages(prev => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            sender: 'system',
            text: 'Peer left the room.',
            timestamp: Date.now()
          }
        ]);
        break;

      case 'room_destroyed':
        navigate('/error', {
          state: {
            title: 'Room Permanently Destroyed',
            message: 'A participant nuked this room. All ephemeral keys and server state have been erased.'
          }
        });
        break;

      case 'error':
        setMessages(prev => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            sender: 'system',
            text: `⚠️ ${data.message || 'Server error'}`,
            timestamp: Date.now()
          }
        ]);
        break;
    }
  }, [publicKey, sendWS, importPeerPublicKey, decrypt, crypto, isPeerVerified, navigate]);

  // 3. Initialize Crypto and Join Room
  useEffect(() => {
    if (!roomId || isJoinedRef.current) return;
    isJoinedRef.current = true;

    async function joinRoomFlow() {
      try {
        // Step A: Check room existence & status
        const info = await getRoomInfo(roomId!);
        setRoomInfo(info);

        if (info.isExpired) {
          navigate('/error', {
            state: {
              title: 'Room Has Expired',
              message: 'This conversation session has expired and can no longer be accessed.'
            }
          });
          return;
        }

        // Step B: Generate client ECDH Keypair
        const pubKey = await initCrypto();

        // Step C: Request single-use join token
        const token = await getJoinToken(roomId!, roomSecretRef.current);

        // Step D: Connect WebSocket
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${import.meta.env.VITE_WS_BASE_URL || `${protocol}//${window.location.host}`}/ws/chat?room_id=${roomId}&token=${token}`;

        connectWS(wsUrl, handleWsMessage, () => {
          console.warn('WebSocket connection closed');
        });

      } catch (err: any) {
        console.error('Room join failed:', err);
        navigate('/error', {
          state: {
            title: 'Failed to Join Room',
            message: err.message || 'Could not verify room token or secret.'
          }
        });
      }
    }

    joinRoomFlow();
  }, [roomId, initCrypto, getRoomInfo, getJoinToken, connectWS, handleWsMessage, navigate]);

  // 4. Message sending handler
  const handleSendMessage = async (text: string) => {
    if (!hasSharedKey) return;
    try {
      const { ciphertext, nonce } = await encrypt(text);
      const sent = sendWS({
        type: 'message',
        encrypted_payload: ciphertext,
        nonce: nonce
      });

      if (sent) {
        setMessages(prev => [
          ...prev,
          {
            id: `msg-${Date.now()}-${Math.random()}`,
            sender: 'me',
            text: text,
            timestamp: Date.now(),
            senderAlias: myAlias
          }
        ]);
      }
    } catch (err) {
      console.error('Failed to encrypt/send message:', err);
    }
  };

  // 5. Room destruction handler
  const handleDestroyRoom = async () => {
    try {
      sendWS({ type: 'destroy' });
      if (roomId && roomSecretRef.current) {
        await apiDestroyRoom(roomId, roomSecretRef.current).catch(() => {});
      }
    } catch {
      // Ignore cleanup error
    } finally {
      closeWS();
      navigate('/', { replace: true });
    }
  };

  // 6. Leave Room handler
  const handleLeaveRoom = () => {
    sendWS({ type: 'leave' });
    closeWS();
    navigate('/', { replace: true });
  };

  const inviteUrl = `${window.location.origin}/room/${roomId}#${roomSecretRef.current}`;

  return (
    <div className="h-screen flex flex-col bg-[#090d16] text-slate-100 selection:bg-brand-500 selection:text-white">
      <RoomHeader
        roomId={roomId}
        status={status}
        participantCount={participantCount}
        hasSharedKey={hasSharedKey}
        formattedTime={formattedTime}
        isUrgent={isUrgent}
        isVerified={isPeerVerified}
        onOpenVerify={() => setShowVerifyModal(true)}
        onOpenInvite={() => setShowInviteModal(true)}
        onDestroy={handleDestroyRoom}
        onLeave={handleLeaveRoom}
      />

      {/* Main Chat Stream */}
      <main className="flex-1 overflow-y-auto px-4 py-6 max-w-4xl w-full mx-auto space-y-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 text-slate-500">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-brand-400 shadow-inner">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div className="space-y-1 max-w-md">
              <h2 className="text-base font-semibold text-slate-300">Room Ready & Awaiting Handshake</h2>
              <p className="text-xs text-slate-400">
                Messages sent here are encrypted client-side using AES-GCM-256 with ephemeral keys. Share the invitation link to start chatting.
              </p>
            </div>
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-950/30 transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              <span>Copy Invitation Link</span>
            </button>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isPeerVerified={isPeerVerified}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Bar */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={!hasSharedKey}
        placeholder={hasSharedKey ? 'Type an encrypted message...' : 'Waiting for peer to connect and exchange keys...'}
      />

      {/* SAS Verification Dialog */}
      <VerificationModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        sasData={sasData}
        isVerified={isPeerVerified}
        onVerify={() => setIsPeerVerified(true)}
      />

      {/* Share / Invite Modal */}
      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        inviteUrl={inviteUrl}
      />
    </div>
  );
}