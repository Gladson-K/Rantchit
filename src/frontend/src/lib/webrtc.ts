// Rantchit voice — peer-to-peer WebRTC mesh.
//
// Media never touches the relay: the server only forwards opaque signalling
// frames (SDP/ICE) end-to-end encrypted by the session key. DTLS-SRTP secures
// the actual audio between browsers. getUserMedia() triggers the browser's
// explicit microphone permission prompt.
//
// Negotiation uses a deterministic initiator (the lexicographically smaller
// peer id) plus a "needOffer" nudge so a late joiner can still be connected by
// an already-active peer without offer glare.

export type SignalPayload =
  | { sdp: RTCSessionDescriptionInit }
  | { candidate: RTCIceCandidateInit }
  | { kind: 'needOffer' };

export interface VoiceHandlers {
  /** Send an opaque signalling payload to one peer (or broadcast if null). */
  send: (to: string | null, payload: SignalPayload) => void;
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  onPeerConnectionChange?: (peerId: string, connected: boolean) => void;
  onError?: (message: string) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
];

export class VoiceCall {
  private selfId = '';
  private handlers: VoiceHandlers;
  private localStream: MediaStream | null = null;
  private pcs = new Map<string, RTCPeerConnection>();
  private pendingIce = new Map<string, RTCIceCandidateInit[]>();
  private makingOffer = new Set<string>();
  private muted = false;
  private active = false;

  constructor(handlers: VoiceHandlers) {
    this.handlers = handlers;
  }

  get isActive() {
    return this.active;
  }

  isMuted() {
    return this.muted;
  }

  getLocalStream() {
    return this.localStream;
  }

  /** Requests microphone access and prepares the local audio track. */
  async start(selfId: string): Promise<void> {
    this.selfId = selfId;
    if (this.localStream) {
      this.active = true;
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support microphone capture.');
    }
    // Browser shows the permission prompt here.
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    this.active = true;
  }

  /** Introduce ourselves to every currently-known peer. */
  async syncPeers(peerIds: string[]) {
    for (const id of peerIds) {
      if (id === this.selfId) continue;
      await this.negotiateWith(id);
    }
  }

  /**
   * Deterministic initiator: the smaller peer id offers; the larger peer asks
   * the smaller one to offer instead. This avoids a double-offer race.
   */
  async negotiateWith(peerId: string) {
    if (peerId === this.selfId) return;
    if (this.selfId < peerId) {
      await this.makeOffer(peerId);
    } else {
      this.handlers.send(peerId, { kind: 'needOffer' });
    }
  }

  private getOrCreatePeer(peerId: string): RTCPeerConnection {
    let pc = this.pcs.get(peerId);
    if (pc) return pc;

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pcs.set(peerId, pc);

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.handlers.send(peerId, { candidate: ev.candidate.toJSON() });
      }
    };

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) this.handlers.onRemoteStream?.(peerId, stream);
    };

    pc.onconnectionstatechange = () => {
      this.handlers.onPeerConnectionChange?.(peerId, pc!.connectionState === 'connected');
    };

    return pc;
  }

  private async makeOffer(peerId: string) {
    if (this.makingOffer.has(peerId)) return;
    const pc = this.getOrCreatePeer(peerId);
    try {
      this.makingOffer.add(peerId);
      const offer = await pc.createOffer({ offerToReceiveAudio: true });
      await pc.setLocalDescription(offer);
      this.handlers.send(peerId, { sdp: offer });
    } catch (e) {
      this.handlers.onError?.(`Failed to create offer: ${(e as Error).message}`);
    } finally {
      this.makingOffer.delete(peerId);
    }
  }

  /** Handle an inbound signalling payload from a peer. */
  async handleSignal(peerId: string, payload: SignalPayload) {
    if (peerId === this.selfId) return;

    if ('kind' in payload && payload.kind === 'needOffer') {
      // The other side is active but not the initiator; we offer.
      if (this.selfId < peerId) await this.makeOffer(peerId);
      return;
    }

    const pc = this.getOrCreatePeer(peerId);
    try {
      if ('sdp' in payload) {
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const queued = this.pendingIce.get(peerId);
        if (queued) {
          for (const cand of queued) {
            await pc.addIceCandidate(cand).catch(() => undefined);
          }
          this.pendingIce.delete(peerId);
        }
        if (payload.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.handlers.send(peerId, { sdp: answer });
        }
      } else if ('candidate' in payload) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(payload.candidate).catch(() => undefined);
        } else {
          const q = this.pendingIce.get(peerId) || [];
          q.push(payload.candidate);
          this.pendingIce.set(peerId, q);
        }
      }
    } catch (e) {
      this.handlers.onError?.(`Voice signalling error: ${(e as Error).message}`);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  removePeer(peerId: string) {
    const pc = this.pcs.get(peerId);
    if (pc) {
      pc.close();
      this.pcs.delete(peerId);
    }
    this.pendingIce.delete(peerId);
    this.makingOffer.delete(peerId);
  }

  stop() {
    for (const pc of this.pcs.values()) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
    this.pcs.clear();
    this.pendingIce.clear();
    this.makingOffer.clear();
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    this.active = false;
    this.muted = false;
  }
}

/**
 * Lightweight speaking detector. Returns a cleanup function.
 * Compares RMS of the analyser to a floor ~0.06.
 */
export function monitorStream(stream: MediaStream, onSpeaking: (speaking: boolean) => void): () => void {
  let ctx: AudioContext | null = null;
  let raf: number | null = null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return () => undefined;
    ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      onSpeaking(Math.sqrt(sum / buf.length) > 0.06);
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch {
    /* monitoring is best-effort */
  }

  return () => {
    if (raf !== null) cancelAnimationFrame(raf);
    if (ctx) ctx.close().catch(() => undefined);
  };
}
