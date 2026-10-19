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
import { generateSASFromTranscript } from '../lib/sas';
import { ChatMessage as MessageType, MkcStatus, RoomInfo, SASData } from '../lib/types';

export function RoomScreen() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const {
    crypto,
    publicKey,
    hasSharedKey,
    initialize: initCrypto,
    establishSession,
    computeConfirmationTag,
    verifyConfirmationTag,
    encrypt,
    decrypt
  } = useCrypto();

  const { getRoomInfo, getJoinToken, destroyRoom: apiDestroyRoom } = useRoom();
  const { status, setStatus, participantCount, connect: connectWS, send: sendWS, close: closeWS } = useWebSocket();

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [sasData, setSasData] = useState<SASData | null>(null);
  const [isPeerVerified, setIsPeerVerified] = useState(false);
  const [mkcStatus, setMkcStatus] = useState<MkcStatus>('pending');
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [myAlias] = useState(() => sessionStorage.getItem('rantchit_alias') || 'You');

  const roomSecretRef = useRef<string>('');
  const secretHashRef = useRef<string>('');
  const publicKeyRef = useRef<string | null>(null);
  const peerKeyRef = useRef<string | null>(null);
  const mkcRef = useRef<MkcStatus>('pending');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isJoinedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    publicKeyRef.current = publicKey;
  }, [publicKey]);

  const pushSystemMessage = useCallback((text: string) => {
    setMessages(prev => [
      ...prev,
      { id: `sys-${Date.now()}-${Math.random()}`, sender: 'system', text, timestamp: Date.now() }
    ]);
  }, []);

  const { formattedTime, isUrgent } = useCountdown(roomInfo?.expiresAt, () => {
    navigate('/error', {
      state: {
        title: 'Room Auto-Expired',
        message: 'This session reached its maximum time-to-live and was permanently wiped.'
      }
    });
  });

  // 1. Extract Room Secret from URL Fragment (never sent to server)
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

  // 2. XBF-MKC protocol handler (reads mutable refs — never stale)
  const handleWsMessage = useCallback(async (data: any) => {
    switch (data.type) {
      case 'connected': {
        const pub = publicKeyRef.current;
        if (pub) sendWS({ type: 'public_key', public_key: pub });
        break;
      }

      case 'peer_joined':
        pushSystemMessage('Peer connected to room. Exchanging ephemeral keys (XBF-MKC v1)...');
        {
          const pub = publicKeyRef.current;
          if (pub) sendWS({ type: 'public_key', public_key: pub });
        }
        break;

      case 'peer_public_key': {
        if (!data.public_key) break;
        if (data.public_key === publicKeyRef.current) break; // ignore self-echo
        if (data.public_key === peerKeyRef.current) break;   // already processed

        try {
          peerKeyRef.current = data.public_key;
          await establishSession(data.public_key);
          const transcript = crypto.getTranscript()!;
          const sas = await generateSASFromTranscript(transcript);
          setSasData(sas);

          // Mutual Key Confirmation: prove we derived the identical session.
          const tag = await computeConfirmationTag();
          sendWS({ type: 'key_confirm', tag });

          pushSystemMessage(
            '🔒 Channel established (ECDH P-256 → HKDF → AES-256-GCM, transcript-bound). ' +
            'Awaiting mutual key confirmation from peer…'
          );
        } catch (e) {
          console.error('Failed to establish XBF-MKC session:', e);
          pushSystemMessage('⚠️ Failed to establish encrypted session with peer public key.');
        }
        break;
      }

      case 'key_confirm': {
        if (mkcRef.current !== 'pending' || !data.tag) break;
        const ok = await verifyConfirmationTag(data.tag);
        if (ok) {
          mkcRef.current = 'confirmed';
          setMkcStatus('confirmed');
          setStatus('confirmed');
          pushSystemMessage(
            '✅ Mutual Key Confirmation passed — both sides derived identical keys. ' +
            'Open "Verify SAS" to compare the fingerprint out-of-band.'
          );
        } else {
          mkcRef.current = 'failed';
          setMkcStatus('failed');
          setStatus('security_alert');
          pushSystemMessage(
            '🚨 SECURITY ALERT: Key confirmation FAILED. The relayed key material was altered — ' +
            'a Man-in-the-Middle is present. Messaging is disabled. Verify nothing and leave immediately.'
          );
        }
        break;
      }

      case 'message': {
        if (mkcRef.current === 'failed') break;
        if (mkcRef.current !== 'confirmed') break;
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
                isVerified: mkcRef.current === 'confirmed'
              }
            ]);
          } catch (err) {
            console.error('Decryption failed for incoming message:', err);
            pushSystemMessage(
              '⚠️ Received a message that failed authentication (wrong key or tampered ciphertext). ' +
              'It was discarded.'
            );
          }
        }
        break;
      }

      case 'participant_left':
        pushSystemMessage('Peer left the room.');
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
        pushSystemMessage(`⚠️ ${data.message || 'Server error'}`);
        break;
    }
  }, [sendWS, establishSession, computeConfirmationTag, verifyConfirmationTag, decrypt, crypto, navigate, pushSystemMessage, setStatus]);

  // 3. Initialize Crypto and Join Room
  useEffect(() => {
    if (!roomId || isJoinedRef.current) return;
    isJoinedRef.current = true;

    async function joinRoomFlow() {
      try {
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

        const pubKey = await initCrypto();
        publicKeyRef.current = pubKey;

        const token = await getJoinToken(roomId!, roomSecretRef.current);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsBase =
          (import.meta.env.VITE_WS_BASE_URL as string | undefined) ||
          (typeof localStorage !== 'undefined' ? localStorage.getItem('rantchit_ws_base') : null) ||
          `${protocol}//${window.location.host}`;
        const wsUrl = `${wsBase}/ws/chat?room_id=${roomId}&token=${token}`;

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

  // 4. Message sending handler — gated on mutual key confirmation
  const handleSendMessage = async (text: string) => {
    if (!hasSharedKey || mkcRef.current !== 'confirmed') return;
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

  const handleLeaveRoom = () => {
    sendWS({ type: 'leave' });
    closeWS();
    navigate('/', { replace: true });
  };

  const inviteUrl = `${window.location.origin}/room/${roomId}#${roomSecretRef.current}`;
  const inputEnabled = hasSharedKey && mkcStatus === 'confirmed';

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
        mkcStatus={mkcStatus}
        onOpenVerify={() => setShowVerifyModal(true)}
        onOpenInvite={() => setShowInviteModal(true)}
        onDestroy={handleDestroyRoom}
        onLeave={handleLeaveRoom}
      />

      {/* MITM hard-fail banner */}
      {mkcStatus === 'failed' && (
        <div
          data-testid="mitm-alert"
          className="bg-rose-950/80 border-b border-rose-600/60 px-4 py-3 text-center"
        >
          <p className="text-rose-300 text-sm font-bold">
            🚨 MITM DETECTED — Key confirmation failed. Messaging disabled. Leave this room.
          </p>
        </div>
      )}

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
                Messages are encrypted client-side with AES-GCM-256 under the XBF-MKC v1 protocol. Share the invitation link to start chatting.
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
              isPeerVerified={isPeerVerified || mkcStatus === 'confirmed'}
            />
          ))
        )}
        <div ref={messagesEndRef} />
      </main>

      <ChatInput
        onSend={handleSendMessage}
        disabled={!inputEnabled}
        placeholder={
          mkcStatus === 'failed'
            ? 'Messaging disabled — security failure detected'
            : inputEnabled
              ? 'Type an encrypted message...'
              : 'Waiting for mutual key confirmation...'
        }
      />

      <VerificationModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        sasData={sasData}
        isVerified={isPeerVerified}
        mkcStatus={mkcStatus}
        onVerify={() => setIsPeerVerified(true)}
      />

      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        inviteUrl={inviteUrl}
      />
    </div>
  );
}
