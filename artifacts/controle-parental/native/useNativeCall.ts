import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import {
  mediaDevices,
  RTCPeerConnection,
  type MediaStream,
  type MediaStreamTrack,
} from 'react-native-webrtc';
import type { RTCSessionDescriptionInit } from 'react-native-webrtc/lib/typescript/RTCSessionDescription';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');
type IceServer = { urls: string | string[]; username?: string; credential?: string };
type IceCandidateInit = { candidate?: string; sdpMLineIndex?: number | null; sdpMid?: string | null };
type CallAuth = {
  signaling: { clerkToken: string } | { childToken: string };
  headers: Record<string, string>;
};
type NativePeer = RTCPeerConnection & {
  addEventListener: (
    event: 'icecandidate' | 'track' | 'iceconnectionstatechange',
    listener: ((event: { candidate: { toJSON: () => IceCandidateInit } | null }) => void)
      | ((event: { streams: MediaStream[] }) => void)
      | (() => void),
  ) => void;
};
const FALLBACK_ICE: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export type NativeCallIdentity =
  | { kind: 'parent'; getToken: () => Promise<string | null> }
  | { kind: 'child'; token: string };

export type NativeCallPhase = 'idle' | 'ringing-outgoing' | 'ringing-incoming' | 'connecting' | 'active' | 'ended';
export type NativeCallReason = 'hangup' | 'declined' | 'missed' | 'busy' | 'canceled' | 'failed';
export type NativeIncomingCall = { callId: string; callerId: string; callerName: string };

export type NativeCallState = {
  phase: NativeCallPhase;
  incomingCall: NativeIncomingCall | null;
  peerName: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  error: string | null;
  endedReason: NativeCallReason | null;
  startCall: (calleeId: string, calleeName: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  cancelCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flipCamera: () => void;
};

async function resolveAuth(identity: NativeCallIdentity): Promise<CallAuth | null> {
  if (identity.kind === 'parent') {
    const token = await identity.getToken();
    return token ? { signaling: { clerkToken: token }, headers: { Authorization: `Bearer ${token}` } } : null;
  }
  return { signaling: { childToken: identity.token }, headers: { 'X-Child-Token': identity.token } };
}

async function getIceServers(headers: Record<string, string>): Promise<IceServer[]> {
  if (!API_URL) return FALLBACK_ICE;
  try {
    const response = await fetch(`${API_URL}/api/calls/turn-credentials`, { method: 'POST', headers });
    if (!response.ok) return FALLBACK_ICE;
    const body = (await response.json()) as { iceServers?: IceServer[] };
    return body.iceServers?.length ? body.iceServers : FALLBACK_ICE;
  } catch {
    return FALLBACK_ICE;
  }
}

async function requestCallPermissions() {
  if (Platform.OS !== 'android') return;
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    PermissionsAndroid.PERMISSIONS.CAMERA,
  ]);
  const granted = Object.values(results).every((result) => result === PermissionsAndroid.RESULTS.GRANTED);
  if (!granted) throw new Error('Permita o uso do microfone e da câmera para fazer chamadas.');
}

/** Sinalização autenticada e mídia WebRTC para chamadas em primeiro plano. */
export function useNativeCall(identity: NativeCallIdentity | null): NativeCallState {
  const [phase, setPhase] = useState<NativeCallPhase>('idle');
  const [incomingCall, setIncomingCall] = useState<NativeIncomingCall | null>(null);
  const [peerName, setPeerName] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endedReason, setEndedReason] = useState<NativeCallReason | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const roleRef = useRef<'caller' | 'callee' | null>(null);
  const authRef = useRef<CallAuth | null>(null);
  const pendingCandidatesRef = useRef<IceCandidateInit[]>([]);
  const earlyCandidatesRef = useRef<IceCandidateInit[]>([]);
  const cameraFacingRef = useRef<'user' | 'environment'>('user');
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback((next: NativeCallPhase, reason: NativeCallReason | null) => {
    peerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setPeerName(null);
    setMuted(false);
    setCameraOff(false);
    callIdRef.current = null;
    roleRef.current = null;
    pendingCandidatesRef.current = [];
    earlyCandidatesRef.current = [];
    setEndedReason(reason);
    setPhase(next);
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    if (next === 'ended') {
      messageTimerRef.current = setTimeout(() => setPhase((current) => current === 'ended' ? 'idle' : current), 3000);
    }
  }, []);

  const fail = useCallback((cause: unknown) => {
    const callId = callIdRef.current;
    if (callId) socketRef.current?.emit('call:hangup', { callId, reason: 'failed' });
    cleanup('idle', null);
    setError(cause instanceof Error ? cause.message : 'A chamada não pôde ser iniciada. Verifique sua conexão e as permissões.');
  }, [cleanup]);

  const getLocalMedia = useCallback(async () => {
    await requestCallPermissions();
    const stream = await mediaDevices.getUserMedia({ audio: true, video: { facingMode: cameraFacingRef.current } });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const buildPeer = useCallback((iceServers: IceServer[], socket: Socket) => {
    const peer = new RTCPeerConnection({ iceServers }) as NativePeer;
    peer.addEventListener('icecandidate', (event: { candidate: { toJSON: () => IceCandidateInit } | null }) => {
      const callId = callIdRef.current;
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      if (callId) socket.emit('webrtc:ice-candidate', { callId, candidate });
      else earlyCandidatesRef.current.push(candidate);
    });
    peer.addEventListener('track', (event: { streams: MediaStream[] }) => setRemoteStream(event.streams?.[0] ?? null));
    peer.addEventListener('iceconnectionstatechange', () => {
      if (peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') setPhase('active');
      if (peer.iceConnectionState === 'failed') {
        const callId = callIdRef.current;
        socket.emit('call:hangup', { callId, reason: 'failed' });
        cleanup('ended', 'failed');
      }
    });
    return peer;
  }, [cleanup]);

  useEffect(() => {
    if (!identity || !API_URL) return;
    let cancelled = false;
    let socket: Socket | null = null;
    const socketKey = identity.kind === 'parent' ? 'parent' : `child:${identity.token}`;

    const resolveSignaling = async () => {
      const auth = await resolveAuth(identity);
      if (auth) authRef.current = auth;
      return auth?.signaling ?? {};
    };

    void resolveAuth(identity).then((auth) => {
      if (cancelled || !auth) return;
      authRef.current = auth;
      socket = io(API_URL, {
        path: '/socket.io',
        auth: (callback) => { void resolveSignaling().then(callback).catch(() => callback({})); },
        autoConnect: true,
        reconnection: true,
      });
      socketRef.current = socket;

      socket.on('call:incoming', (incoming: NativeIncomingCall) => {
        if (callIdRef.current) return;
        callIdRef.current = incoming.callId;
        roleRef.current = 'callee';
        setIncomingCall(incoming);
        setPeerName(incoming.callerName);
        setError(null);
        setPhase('ringing-incoming');
      });

      socket.on('call:accepted', async ({ callId }: { callId: string }) => {
        if (callId !== callIdRef.current || roleRef.current !== 'caller') return;
        try {
          const peer = peerRef.current;
          if (!peer) throw new Error('A chamada foi encerrada antes de conectar.');
          setPhase('connecting');
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          socket?.emit('webrtc:offer', { callId, sdp: offer });
        } catch (cause) {
          fail(cause);
        }
      });

      socket.on('webrtc:offer', async ({ callId, sdp }: { callId: string; sdp: RTCSessionDescriptionInit }) => {
        if (callId !== callIdRef.current || roleRef.current !== 'callee') return;
        try {
          const peer = peerRef.current;
          if (!peer) return;
          await peer.setRemoteDescription(sdp);
          for (const candidate of pendingCandidatesRef.current) await peer.addIceCandidate(candidate);
          pendingCandidatesRef.current = [];
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket?.emit('webrtc:answer', { callId, sdp: answer });
          setPhase('connecting');
        } catch (cause) {
          fail(cause);
        }
      });

      socket.on('webrtc:answer', async ({ callId, sdp }: { callId: string; sdp: RTCSessionDescriptionInit }) => {
        if (callId !== callIdRef.current) return;
        try {
          const peer = peerRef.current;
          if (!peer) return;
          await peer.setRemoteDescription(sdp);
          for (const candidate of pendingCandidatesRef.current) await peer.addIceCandidate(candidate);
          pendingCandidatesRef.current = [];
        } catch (cause) {
          fail(cause);
        }
      });

      socket.on('webrtc:ice-candidate', async ({ callId, candidate }: { callId: string; candidate: RTCIceCandidateInit }) => {
        if (callId !== callIdRef.current) return;
        const peer = peerRef.current;
        if (!peer || !peer.remoteDescription) pendingCandidatesRef.current.push(candidate);
        else await peer.addIceCandidate(candidate).catch(() => undefined);
      });

      const end = (reason: NativeCallReason) => (payload: { callId: string; reason?: NativeCallReason }) => {
        if (payload.callId === callIdRef.current) cleanup('ended', payload.reason ?? reason);
      };
      socket.on('call:declined', end('declined'));
      socket.on('call:canceled', end('canceled'));
      socket.on('call:missed', end('missed'));
      socket.on('call:ended', end('hangup'));
    }).catch(fail);

    return () => {
      cancelled = true;
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      cleanup('idle', null);
    };
  }, [identity?.kind, identity?.kind === 'child' ? identity.token : null, cleanup, fail]);

  const startCall = useCallback(async (calleeId: string, calleeName: string) => {
    const socket = socketRef.current;
    const auth = authRef.current;
    if (!socket || !auth) {
      setError('Conectando à rede. Tente novamente em alguns segundos.');
      return;
    }
    setError(null);
    setEndedReason(null);
    roleRef.current = 'caller';
    setPeerName(calleeName);
    setPhase('ringing-outgoing');
    try {
      const [iceServers, stream] = await Promise.all([getIceServers(auth.headers), getLocalMedia()]);
      const peer = buildPeer(iceServers, socket);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peerRef.current = peer;
      socket.emit('call:invite', { calleeId }, (response: { callId?: string; error?: string }) => {
        if (response.error || !response.callId) {
          fail(new Error(response.error === 'busy' ? 'A outra pessoa já está em uma chamada.' : response.error === 'video_not_allowed' ? 'As regras atuais não permitem chamadas.' : 'Não foi possível iniciar a chamada.'));
          return;
        }
        callIdRef.current = response.callId;
        for (const candidate of earlyCandidatesRef.current) {
          socket.emit('webrtc:ice-candidate', { callId: response.callId, candidate });
        }
        earlyCandidatesRef.current = [];
      });
    } catch (cause) {
      fail(cause);
    }
  }, [buildPeer, fail, getLocalMedia]);

  const acceptCall = useCallback(async () => {
    const socket = socketRef.current;
    const auth = authRef.current;
    const callId = callIdRef.current;
    if (!socket || !auth || !callId) return;
    setError(null);
    setPhase('connecting');
    try {
      const [iceServers, stream] = await Promise.all([getIceServers(auth.headers), getLocalMedia()]);
      const peer = buildPeer(iceServers, socket);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peerRef.current = peer;
      socket.emit('call:accept', { callId });
    } catch (cause) {
      fail(cause);
    }
  }, [buildPeer, fail, getLocalMedia]);

  const finish = useCallback((event: 'call:decline' | 'call:cancel' | 'call:hangup') => {
    const socket = socketRef.current;
    const callId = callIdRef.current;
    if (socket && callId) socket.emit(event, { callId, ...(event === 'call:hangup' ? { reason: 'hangup' } : {}) });
    setError(null);
    cleanup('idle', null);
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
      return next;
    });
  }, []);
  const toggleCamera = useCallback(() => {
    setCameraOff((current) => {
      const next = !current;
      localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = !next; });
      return next;
    });
  }, []);
  const flipCamera = useCallback(() => {
    cameraFacingRef.current = cameraFacingRef.current === 'user' ? 'environment' : 'user';
    localStreamRef.current?.getVideoTracks().forEach((track) => track._switchCamera());
  }, []);

  return {
    phase, incomingCall, peerName, localStream, remoteStream, muted, cameraOff, error, endedReason,
    startCall, acceptCall, declineCall: () => finish('call:decline'), cancelCall: () => finish('call:cancel'),
    hangUp: () => finish('call:hangup'), toggleMute, toggleCamera, flipCamera,
  };
}
