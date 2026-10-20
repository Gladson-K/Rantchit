import { useRef, useState, useCallback, useEffect } from 'react';
import { ChatWebSocket } from '../lib/websocket';
import { ConnectionStatusType } from '../lib/types';

export function useWebSocket() {
  const wsRef = useRef<ChatWebSocket | null>(null);
  // Keep the latest message handler in a ref so WebSocket events never hit a stale closure.
  const onMessageRef = useRef<((data: any) => void) | null>(null);
  const [status, setStatus] = useState<ConnectionStatusType>('idle');
  const [participantCount, setParticipantCount] = useState<number>(1);

  const connect = useCallback((
    url: string,
    onMessage: (data: any) => void,
    onClose?: () => void
  ) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    onMessageRef.current = onMessage;
    const ws = new ChatWebSocket();
    wsRef.current = ws;
    setStatus('connecting');

    ws.connect(
      url,
      (data) => {
        if (data.type === 'connected') {
          setStatus('connected');
          if (data.participants !== undefined) {
            setParticipantCount(data.participants);
          }
        } else if (data.type === 'peer_joined') {
          setStatus('peer_joined');
          if (data.participants !== undefined) {
            setParticipantCount(data.participants);
          }
        } else if (data.type === 'peer_public_key') {
          setStatus('keys_exchanged');
        } else if (data.type === 'key_confirm') {
          // confirmed / security_alert decided by the protocol handler in onMessage
        } else if (data.type === 'peer_list') {
          if (Array.isArray(data.peers)) {
            setParticipantCount(data.peers.length);
          }
        } else if (data.type === 'participant_left') {
          setStatus('waiting_peer');
          if (data.participants !== undefined) {
            setParticipantCount(data.participants);
          }
        } else if (data.type === 'room_destroyed') {
          setStatus('destroyed');
        }
        onMessageRef.current?.(data);
      },
      () => {
        setStatus('disconnected');
        onClose?.();
      },
      () => {
        setStatus('connected');
      }
    );
  }, []);

  const send = useCallback((data: any) => {
    return wsRef.current?.send(data) || false;
  }, []);

  const close = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    status,
    setStatus,
    participantCount,
    connect,
    send,
    close,
    isConnected: status === 'confirmed' || status === 'group_ready' || status === 'keys_exchanged' || status === 'connected' || status === 'peer_joined'
  };
}
