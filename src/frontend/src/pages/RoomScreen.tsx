import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
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
import { ParticipantList } from '../components/ParticipantList';
import { VoicePanel } from '../components/VoicePanel';
import { GamesPanel } from '../components/GamesPanel';
import { RetroTabs, TabDef } from '../components/RetroUI';
import { generateSASFromTranscript } from '../lib/sas';
import { normalizePeers } from '../lib/peers';
import { monitorStream, VoiceCall, hasTurnConfigured } from '../lib/webrtc';
import {
  ChatMessage as MessageType,
  MkcStatus,
  Peer,
  RoomInfo,
  SASData,
  VoiceState,
} from '../lib/types';

type TabId = 'chat' | 'arcade' | 'voice';

const turnConfigured = hasTurnConfigured();

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
    establishGroupSession,
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
  const [maxParticipants, setMaxParticipants] = useState<number>(2);
  const [roster, setRoster] = useState<Peer[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [muted, setMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});

  const roomSecretRef = useRef<string>('');
  const secretHashRef = useRef<string>('');
  const publicKeyRef = useRef<string | null>(null);
  const peerKeyRef = useRef<string | null>(null);
  const peerKeysRef = useRef<Map<string, string>>(new Map());
  const groupSigRef = useRef<string>('');
  const expectedOthersRef = useRef<number>(0);
  const isGroupRoomRef = useRef<boolean>(false);
  const maxParticipantsRef = useRef<number>(2);
  const mkcRef = useRef<MkcStatus>('pending');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isJoinedRef = useRef(false);

  const rosterRef = useRef<Peer[]>([]);
  const selfIdRef = useRef<string | null>(null);
  const voiceRef = useRef<VoiceCall | null>(null);
  const monitorsRef = useRef<Map<string, () => void>>(new Map());
  const gameHandlersRef = useRef<Set<(from: string, payload: any) => void>>(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    publicKeyRef.current = publicKey;
  }, [publicKey]);

  useEffect(() => {
    rosterRef.current = roster;
  }, [roster]);

  useEffect(() => {
    selfIdRef.current = selfId;
  }, [selfId]);

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

  /* ------------------------------------------------------------------ */
  /* Opaque relay helper (E2EE payloads, server never sees plaintext)    */
  /* ------------------------------------------------------------------ */
  const sendRelay = useCallback(
    async (kind: 'signal' | 'game' | 'presence', to: string | null, obj: unknown): Promise<boolean> => {
      try {
        const { ciphertext, nonce } = await encrypt(JSON.stringify(obj));
        return sendWS({ type: kind, to: to || undefined, encrypted_payload: ciphertext, nonce });
      } catch (e) {
        console.error(`Failed to send ${kind} frame:`, e);
        return false;
      }
    },
    [encrypt, sendWS]
  );

  /* ------------------------------------------------------------------ */
  /* Group key derivation (>2 participant rooms)                         */
  /* ------------------------------------------------------------------ */
  const maybeEstablishGroup = useCallback(async () => {
    if (!isGroupRoomRef.current || !publicKeyRef.current) return;
    const expected = expectedOthersRef.current;
    const keys = Array.from(peerKeysRef.current.values());
    if (expected < 1 || keys.length < expected) return;

    const sig = keys.slice().sort().join('|');
    if (sig === groupSigRef.current) return;
    groupSigRef.current = sig;

    try {
      await establishGroupSession(keys);
      const transcript = crypto.getTranscript();
      if (transcript) {
        setSasData(await generateSASFromTranscript(transcript));
      }
      mkcRef.current = 'group';
      setMkcStatus('group');
      setStatus('group_ready');
      pushSystemMessage(
        `🔒 Group key established for ${expected + 1} players (room secret × sorted ephemeral keys).`
      );
    } catch (e) {
      console.error('Group key establishment failed:', e);
      pushSystemMessage('⚠️ Failed to derive the group key.');
    }
  }, [establishGroupSession, crypto, setStatus, pushSystemMessage]);

  /* ------------------------------------------------------------------ */
  /* XBF-MKC protocol handler (reads mutable refs — never stale)         */
  /* ------------------------------------------------------------------ */
  /** Drop all per-peer media state (monitor, stream, speaking flag). */
  const cleanupPeerMedia = useCallback((peerId: string) => {
    monitorsRef.current.get(peerId)?.();
    monitorsRef.current.delete(peerId);
    setRemoteStreams(prev => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
    setSpeaking(prev => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const handleWsMessage = useCallback(async (data: any) => {
    switch (data.type) {
      case 'connected': {
        if (data.peer_id) setSelfId(data.peer_id);
        if (typeof data.max_participants === 'number') {
          setMaxParticipants(data.max_participants);
          maxParticipantsRef.current = data.max_participants;
          isGroupRoomRef.current = data.max_participants > 2;
        }
        const pub = publicKeyRef.current;
        if (pub) sendWS({ type: 'public_key', public_key: pub });
        sendWS({ type: 'hello', alias: myAlias });
        break;
      }

      case 'peer_list': {
        const peers: Peer[] = normalizePeers(data.peers);
        setRoster(peers);
        expectedOthersRef.current = Math.max(0, peers.length - 1);
        const liveIds = new Set(peers.map((p) => p.peerId));
        for (const id of Array.from(peerKeysRef.current.keys())) {
          if (!liveIds.has(id)) peerKeysRef.current.delete(id);
        }
        if (isGroupRoomRef.current) {
          await maybeEstablishGroup();
        }
        break;
      }

      case 'peer_joined':
        pushSystemMessage('Peer connected. Exchanging ephemeral keys...');
        {
          const pub = publicKeyRef.current;
          if (pub) sendWS({ type: 'public_key', public_key: pub });
          if (voiceRef.current?.isActive && data.peer_id) {
            void voiceRef.current.syncPeers([data.peer_id]);
          }
        }
        break;

      case 'peer_public_key': {
        const from: string = data.from || 'peer';
        if (!data.public_key) break;
        if (data.public_key === publicKeyRef.current) break;

        if (isGroupRoomRef.current) {
          peerKeysRef.current.set(from, data.public_key);
          await maybeEstablishGroup();
          break;
        }

        // Pairwise XBF-MKC (2-participant rooms)
        if (data.public_key === peerKeyRef.current) break;
        try {
          peerKeyRef.current = data.public_key;
          await establishSession(data.public_key);
          const transcript = crypto.getTranscript();
          if (transcript) setSasData(await generateSASFromTranscript(transcript));

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
        if (isGroupRoomRef.current) break;
        if (mkcRef.current !== 'pending' || !data.tag) break;
        const ok = await verifyConfirmationTag(data.tag);
        if (ok) {
          mkcRef.current = 'confirmed';
          setMkcStatus('confirmed');
          setStatus('confirmed');
          pushSystemMessage(
            '✅ Mutual Key Confirmation passed. Open "Verify SAS" to compare the fingerprint out-of-band.'
          );
        } else {
          mkcRef.current = 'failed';
          setMkcStatus('failed');
          setStatus('security_alert');
          pushSystemMessage(
            '🚨 SECURITY ALERT: Key confirmation FAILED. A Man-in-the-Middle is present. Messaging is disabled.'
          );
        }
        break;
      }

      case 'message': {
        if (mkcRef.current === 'failed') break;
        if (mkcRef.current !== 'confirmed' && mkcRef.current !== 'group') break;
        if (data.encrypted_payload && data.nonce) {
          try {
            const plaintext = await decrypt(data.encrypted_payload, data.nonce);
            const fromPeer: string | undefined = data.from;
            const alias = rosterRef.current.find((p) => p.peerId === fromPeer)?.alias;
            setMessages(prev => [
              ...prev,
              {
                id: `msg-${Date.now()}-${Math.random()}`,
                sender: 'peer',
                text: plaintext,
                timestamp: Date.now(),
                senderAlias: alias,
                peerId: fromPeer,
                isVerified: mkcRef.current === 'confirmed' || mkcRef.current === 'group'
              }
            ]);
          } catch (err) {
            console.error('Decryption failed for incoming message:', err);
            pushSystemMessage('⚠️ Received a message that failed authentication. It was discarded.');
          }
        }
        break;
      }

      case 'signal': {
        if (!data.encrypted_payload || !data.nonce || !voiceRef.current) break;
        try {
          const plain = await decrypt(data.encrypted_payload, data.nonce);
          await voiceRef.current.handleSignal(data.from, JSON.parse(plain));
        } catch (e) {
          console.error('Voice signalling frame failed:', e);
        }
        break;
      }

      case 'game': {
        if (!data.encrypted_payload || !data.nonce) break;
        try {
          const plain = await decrypt(data.encrypted_payload, data.nonce);
          const payload = JSON.parse(plain);
          for (const handler of gameHandlersRef.current) handler(data.from, payload);
        } catch (e) {
          console.error('Game frame failed:', e);
        }
        break;
      }

      case 'participant_left':
        pushSystemMessage('A player left the room.');
        if (data.peer_id) {
          voiceRef.current?.removePeer(data.peer_id);
          cleanupPeerMedia(data.peer_id);
        }
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
  }, [
    sendWS, establishSession, computeConfirmationTag, verifyConfirmationTag, decrypt,
    crypto, navigate, pushSystemMessage, setStatus, myAlias, maybeEstablishGroup, cleanupPeerMedia
  ]);

  /* ------------------------------------------------------------------ */
  /* Join flow                                                           */
  /* ------------------------------------------------------------------ */
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

  useEffect(() => {
    if (!roomId || isJoinedRef.current) return;
    isJoinedRef.current = true;

    async function joinRoomFlow() {
      try {
        const info = await getRoomInfo(roomId!);
        setRoomInfo(info);
        setMaxParticipants(info.maxParticipants || 2);
        maxParticipantsRef.current = info.maxParticipants || 2;
        isGroupRoomRef.current = (info.maxParticipants || 2) > 2;

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

  /* ------------------------------------------------------------------ */
  /* Messaging                                                           */
  /* ------------------------------------------------------------------ */
  const inputEnabled = mkcStatus === 'confirmed' || mkcStatus === 'group';

  const handleSendMessage = async (text: string) => {
    if (!hasSharedKey || !inputEnabled) return;
    try {
      const { ciphertext, nonce } = await encrypt(text);
      const sent = sendWS({ type: 'message', encrypted_payload: ciphertext, nonce });
      if (sent) {
        setMessages(prev => [
          ...prev,
          {
            id: `msg-${Date.now()}-${Math.random()}`,
            sender: 'me',
            text,
            timestamp: Date.now(),
            senderAlias: myAlias
          }
        ]);
      }
    } catch (err) {
      console.error('Failed to encrypt/send message:', err);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Voice                                                               */
  /* ------------------------------------------------------------------ */
  const handleRemoteStream = useCallback((peerId: string, stream: MediaStream) => {
    setRemoteStreams(prev => ({ ...prev, [peerId]: stream }));
    monitorsRef.current.get(peerId)?.();
    monitorsRef.current.set(
      peerId,
      monitorStream(stream, (talking) => setSpeaking(prev => ({ ...prev, [peerId]: talking })))
    );
  }, []);

  const startVoice = async () => {
    const id = selfIdRef.current;
    if (!id) return;
    // Signalling frames are E2E-encrypted, so the session key must exist first.
    if (!(mkcRef.current === 'confirmed' || mkcRef.current === 'group')) {
      setVoiceError('Voice unlocks once the encrypted session is ready.');
      return;
    }
    setVoiceError(null);
    setVoiceState('requesting');
    try {
      const call = new VoiceCall({
        send: (to, payload) => {
          void sendRelay('signal', to, payload);
        },
        onRemoteStream: handleRemoteStream,
        onPeerConnectionChange: (peerId, state) => {
          if (state === 'failed') {
            setVoiceError(
              'A peer audio connection failed. This usually means NAT traversal failed — configure a TURN server (see docs/BOTTLENECKS.md).'
            );
          }
        },
        onError: (m) => setVoiceError(m),
      });
      voiceRef.current = call;
      await call.start(id);
      setVoiceState('connecting');

      const local = call.getLocalStream();
      if (local) {
        monitorsRef.current.get(id)?.();
        monitorsRef.current.set(
          id,
          monitorStream(local, (talking) => setSpeaking(prev => ({ ...prev, [id]: talking })))
        );
      }

      const others = rosterRef.current.filter(p => p.peerId !== id).map(p => p.peerId);
      await call.syncPeers(others);
      setVoiceState('live');
    } catch (e: any) {
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        setVoiceState('denied');
      } else {
        setVoiceState('error');
        setVoiceError(e?.message || 'Voice failed to start.');
      }
    }
  };

  const stopVoice = useCallback(() => {
    voiceRef.current?.stop();
    voiceRef.current = null;
    monitorsRef.current.forEach(fn => fn());
    monitorsRef.current.clear();
    setRemoteStreams({});
    setSpeaking({});
    setVoiceState('idle');
    setMuted(false);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    voiceRef.current?.setMuted(next);
    setMuted(next);
    if (next) setSpeaking(prev => ({ ...prev, [selfIdRef.current || '']: false }));
  };

  useEffect(() => {
    return () => {
      stopVoice();
    };
  }, [stopVoice]);

  /* ------------------------------------------------------------------ */
  /* Relay subscriptions for the arcade                                  */
  /* ------------------------------------------------------------------ */
  const subscribeGame = useCallback((handler: (from: string, payload: any) => void) => {
    gameHandlersRef.current.add(handler);
    return () => {
      gameHandlersRef.current.delete(handler);
    };
  }, []);

  const sendGame = useCallback((to: string, payload: unknown) => {
    void sendRelay('game', to, payload);
  }, [sendRelay]);

  /* ------------------------------------------------------------------ */
  /* Room lifecycle                                                      */
  /* ------------------------------------------------------------------ */
  const handleDestroyRoom = async () => {
    stopVoice();
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
    stopVoice();
    sendWS({ type: 'leave' });
    closeWS();
    navigate('/', { replace: true });
  };

  const inviteUrl = `${window.location.origin}/room/${roomId}#${roomSecretRef.current}`;

  const tabs: TabDef[] = useMemo(
    () => [
      { id: 'chat', label: 'Chat', icon: '💬' },
      { id: 'voice', label: 'Voice', icon: '🎙️' },
      { id: 'arcade', label: 'Arcade', icon: '🕹️' },
    ],
    []
  );

  return (
    <div className="h-screen flex flex-col bg-arcade-bg text-arcade-text selection:bg-arcade-green selection:text-black">
      <RoomHeader
        roomId={roomId}
        status={status}
        participantCount={participantCount}
        maxParticipants={maxParticipants}
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

      {mkcStatus === 'failed' && (
        <div
          data-testid="mitm-alert"
          className="bg-arcade-red/20 border-b-3 border-arcade-red px-4 py-2.5 text-center animate-shake"
        >
          <p className="font-pixel text-[9px] text-arcade-red uppercase tracking-wider">
            !! MITM DETECTED — Key confirmation failed. Messaging disabled. Leave this room.
          </p>
        </div>
      )}

      <div className="max-w-6xl w-full mx-auto px-3 sm:px-4 pt-3">
        <RetroTabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="max-w-6xl mx-auto h-full flex gap-4 p-3 sm:p-4">
          <div className="flex-1 flex flex-col min-w-0">
            {activeTab === 'chat' && (
              <>
                <main className="flex-1 overflow-y-auto retro-panel retro-grid-bg p-3 sm:p-4 space-y-1">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                      <div className="text-5xl animate-float">🛰️</div>
                      <h2 className="font-pixel text-[10px] text-arcade-cyan">AWAITING HANDSHAKE</h2>
                      <p className="text-sm text-arcade-muted font-term text-base max-w-md leading-snug">
                        Messages are encrypted client-side with AES-GCM-256. Share the invitation link to bring
                        players into the room.
                      </p>
                      <button onClick={() => setShowInviteModal(true)} className="retro-btn retro-btn-cyan">
                        COPY INVITATION LINK
                      </button>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <ChatMessage
                        key={msg.id}
                        message={msg}
                        isPeerVerified={isPeerVerified || inputEnabled}
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
                        : 'Waiting for key confirmation...'
                  }
                />
              </>
            )}

            {activeTab === 'voice' && (
              <div className="flex-1 overflow-y-auto">
                <VoicePanel
                  voiceState={voiceState}
                  muted={muted}
                  error={voiceError}
                  peers={roster}
                  selfId={selfId}
                  remoteStreams={remoteStreams}
                  speaking={speaking}
                  onStart={startVoice}
                  onStop={stopVoice}
                  onToggleMute={toggleMute}
                  disabled={!inputEnabled}
                  turnConfigured={turnConfigured}
                />
              </div>
            )}

            {activeTab === 'arcade' && (
              <div className="flex-1 overflow-y-auto">
                <GamesPanel
                  selfId={selfId}
                  peers={roster}
                  sendGame={sendGame}
                  subscribeGame={subscribeGame}
                />
              </div>
            )}
          </div>

          <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-3 overflow-y-auto">
            <ParticipantList
              peers={roster}
              selfId={selfId}
              selfAlias={myAlias}
              maxParticipants={maxParticipants}
              speaking={speaking}
            />
            <div className="retro-panel p-3 space-y-2">
              <span className="retro-label">Security</span>
              <div className="font-term text-base text-arcade-muted leading-snug">
                {crypto.getTranscript()
                  ? `${crypto.getTranscript()!.slice(0, 24)}…`
                  : 'no session yet'}
              </div>
            </div>
          </aside>
        </div>
      </div>

      <VerificationModal
        isOpen={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        sasData={sasData}
        isVerified={isPeerVerified}
        mkcStatus={mkcStatus}
        onVerify={() => setIsPeerVerified(true)}
        isGroup={maxParticipants > 2}
        participantCount={participantCount}
      />

      <InviteModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        inviteUrl={inviteUrl}
        maxParticipants={maxParticipants}
      />
    </div>
  );
}
