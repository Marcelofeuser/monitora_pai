import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { connectSignaling, type SignalingAuth } from "@/lib/socket";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Identidade de quem está chamando/atendendo -- resolve tanto o handshake
// do socket (SignalingAuth) quanto os headers HTTP da rota de credenciais
// TURN, com os mesmos três mecanismos usados no resto do app. O token do
// Responsável é assíncrono (Clerk) e pode expirar, por isso é uma função
// (`getToken`), não um valor fixo -- Criança/Contato usam token de
// dispositivo fixo (localStorage), por isso um valor direto basta.
export type CallIdentity =
  | { kind: "parent"; getToken: () => Promise<string | null> }
  | { kind: "child"; token: string }
  | { kind: "contact"; token: string };

export type CallPhase =
  | "idle"
  | "ringing-outgoing"
  | "ringing-incoming"
  | "connecting"
  | "active"
  | "ended";

export type CallEndedReason = "hangup" | "declined" | "missed" | "busy" | "canceled" | "failed";

type IncomingCall = { callId: string; callerId: string; callerName: string };

export type UseCallResult = {
  phase: CallPhase;
  incomingCall: IncomingCall | null;
  outgoingCalleeName: string | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  endedReason: CallEndedReason | null;
  error: string | null;
  startCall: (calleeId: string, calleeName: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  cancelCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flipCamera: () => Promise<void>;
};

async function resolveAuth(identity: CallIdentity): Promise<{ signaling: SignalingAuth; headers: HeadersInit } | null> {
  if (identity.kind === "parent") {
    const token = await identity.getToken();
    if (!token) return null;
    return { signaling: { clerkToken: token }, headers: { Authorization: `Bearer ${token}` } };
  }
  if (identity.kind === "child") {
    return { signaling: { childToken: identity.token }, headers: { "X-Child-Token": identity.token } };
  }
  return { signaling: { contactToken: identity.token }, headers: { "X-Contact-Token": identity.token } };
}

async function fetchIceServers(headers: HeadersInit): Promise<RTCIceServer[]> {
  try {
    const res = await fetch(`${API_URL}/api/calls/turn-credentials`, { method: "POST", headers });
    if (!res.ok) return [{ urls: "stun:stun.l.google.com:19302" }];
    const data = (await res.json()) as { iceServers?: RTCIceServer[] };
    return data.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }];
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}

/**
 * Máquina de estado de chamada de voz/vídeo -- compartilhada pelos três
 * papéis (Responsável, Criança, Contato). Servidor é autoridade sobre
 * existência da chamada e as transições ringing->active/ended (ver
 * signaling/index.ts no api-server); este hook só comanda o
 * RTCPeerConnection em cima do que o servidor confirma, nunca o contrário.
 *
 * CORTE DE ESCOPO CONHECIDO (v1, ver plano): sem ICE restart -- troca de
 * rede (wifi->dados) derruba a chamada, qualquer lado pode ligar de novo na
 * hora.
 */
export function useCall(identity: CallIdentity | null): UseCallResult {
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [outgoingCalleeName, setOutgoingCalleeName] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [endedReason, setEndedReason] = useState<CallEndedReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const roleRef = useRef<"caller" | "callee" | null>(null);
  const facingModeRef = useRef<"user" | "environment">("user");
  const currentAuthRef = useRef<{ signaling: SignalingAuth; headers: HeadersInit } | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  // Espelha o state localStream -- os handlers de socket são registrados
  // UMA vez (ver useEffect com deps [identity?.kind] logo abaixo) e por
  // isso fecham sobre a versão de `cleanup` daquele momento; se cleanup
  // dependesse do state `localStream` diretamente (useCallback com esse
  // dep), esses handlers ficariam presos pra sempre com o valor inicial
  // (null). Como ref, `localStreamRef.current` está sempre atualizado não
  // importa quando o closure foi criado.
  const localStreamRef = useRef<MediaStream | null>(null);

  const cleanup = useCallback((nextPhase: CallPhase, reason: CallEndedReason | null) => {
    // sender.track?.stop() já para os tracks reais (são o MESMO objeto
    // MediaStreamTrack adicionado via pc.addTrack) -- isso cobre o
    // essencial (apagar a luz da câmera/mic) mesmo se localStreamRef
    // estiver desatualizado por algum motivo. O stop() abaixo é só
    // redundância defensiva.
    pcRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setOutgoingCalleeName(null);
    setMuted(false);
    setCameraOff(false);
    callIdRef.current = null;
    roleRef.current = null;
    pendingCandidatesRef.current = [];
    setEndedReason(reason);
    setPhase(nextPhase);
    if (nextPhase === "ended") {
      setTimeout(() => setPhase((p) => (p === "ended" ? "idle" : p)), 3000);
    }
  }, []);

  async function getLocalMedia(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { facingMode: facingModeRef.current },
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  function buildPeerConnection(iceServers: RTCIceServer[], socket: Socket, callId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:ice-candidate", { callId, candidate: event.candidate.toJSON() });
      }
    };
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0] ?? null);
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        setPhase("active");
      } else if (pc.iceConnectionState === "failed") {
        socket.emit("call:hangup", { callId, reason: "failed" });
        cleanup("ended", "failed");
      }
    };
    return pc;
  }

  // Conecta o socket assim que a identidade estiver pronta, e escuta os
  // eventos de convite/aceite/etc pelo resto da vida do componente.
  useEffect(() => {
    if (!identity) return;
    let cancelled = false;

    // Chave estável de identidade (não o token) -- decide se o singleton em
    // connectSignaling reaproveita o socket existente ou troca.
    const socketKey = identity.kind === "parent" ? "parent" : `${identity.kind}:${identity.token}`;

    // Reinvocado a cada tentativa de conexão do socket (a inicial e as
    // automáticas de reconnection: true) -- não só uma vez aqui no mount.
    // Sem isso, o token Clerk do Responsável (expira em ~60s) ficaria
    // congelado no valor capturado agora: uma reconexão automática depois
    // de queda de rede tentaria de novo com o MESMO token vencido, falharia
    // pra sempre (not_authenticated), e o Responsável pararia de conseguir
    // receber chamada silenciosamente até recarregar a página. Também
    // mantém currentAuthRef atualizado (usado pro header da rota de
    // credenciais TURN em startCall/acceptCall).
    const resolveSignalingAuth = async () => {
      const auth = await resolveAuth(identity);
      if (!auth) return null;
      currentAuthRef.current = auth;
      return auth.signaling;
    };

    (async () => {
      const auth = await resolveAuth(identity);
      if (cancelled || !auth) return;
      currentAuthRef.current = auth;
      const socket = connectSignaling(socketKey, resolveSignalingAuth);
      socketRef.current = socket;

      socket.on("call:incoming", ({ callId, callerId, callerName }: IncomingCall) => {
        callIdRef.current = callId;
        roleRef.current = "callee";
        setIncomingCall({ callId, callerId, callerName });
        setPhase("ringing-incoming");
      });

      socket.on("call:accepted", async ({ callId }: { callId: string }) => {
        if (callId !== callIdRef.current || roleRef.current !== "caller") return;
        setPhase("connecting");
        const pc = pcRef.current;
        if (!pc) return;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { callId, sdp: offer });
      });

      socket.on("webrtc:offer", async ({ callId, sdp }: { callId: string; sdp: RTCSessionDescriptionInit }) => {
        if (callId !== callIdRef.current || roleRef.current !== "callee") return;
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(sdp);
        for (const candidate of pendingCandidatesRef.current) await pc.addIceCandidate(candidate);
        pendingCandidatesRef.current = [];
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { callId, sdp: answer });
        setPhase("connecting");
      });

      socket.on("webrtc:answer", async ({ callId, sdp }: { callId: string; sdp: RTCSessionDescriptionInit }) => {
        if (callId !== callIdRef.current) return;
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(sdp);
        for (const candidate of pendingCandidatesRef.current) await pc.addIceCandidate(candidate);
        pendingCandidatesRef.current = [];
      });

      socket.on("webrtc:ice-candidate", async ({ callId, candidate }: { callId: string; candidate: RTCIceCandidateInit }) => {
        if (callId !== callIdRef.current) return;
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingCandidatesRef.current.push(candidate);
          return;
        }
        await pc.addIceCandidate(candidate).catch(() => {});
      });

      socket.on("call:declined", ({ callId }: { callId: string }) => {
        if (callId !== callIdRef.current) return;
        cleanup("ended", "declined");
      });
      socket.on("call:canceled", ({ callId }: { callId: string }) => {
        if (callId !== callIdRef.current) return;
        cleanup("ended", "canceled");
      });
      socket.on("call:missed", ({ callId }: { callId: string }) => {
        if (callId !== callIdRef.current) return;
        cleanup("ended", "missed");
      });
      socket.on("call:ended", ({ callId, reason }: { callId: string; reason: CallEndedReason }) => {
        if (callId !== callIdRef.current) return;
        cleanup("ended", reason);
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.kind]);

  const startCall = useCallback(async (calleeId: string, calleeName: string) => {
    const socket = socketRef.current;
    const auth = currentAuthRef.current;
    if (!socket || !auth) {
      setError("Sem conexão -- tente de novo em alguns segundos.");
      return;
    }
    setError(null);
    setEndedReason(null);
    roleRef.current = "caller";
    setOutgoingCalleeName(calleeName);
    setPhase("ringing-outgoing");

    const [iceServers, stream] = await Promise.all([fetchIceServers(auth.headers), getLocalMedia()]);
    const pc = buildPeerConnection(iceServers, socket, "");
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pcRef.current = pc;

    socket.emit("call:invite", { calleeId }, (res: { callId?: string; error?: string }) => {
      if (res.error || !res.callId) {
        setError(
          res.error === "busy"
            ? "A pessoa já está em outra chamada."
            : res.error === "video_not_allowed"
              ? "Chamada não permitida pelas restrições configuradas."
              : "Não foi possível iniciar a chamada.",
        );
        cleanup("idle", null);
        return;
      }
      callIdRef.current = res.callId;
      // onicecandidate já registrado com callId vazio -- corrige agora que
      // temos o id de verdade (invite é assíncrono, o pc é criado antes do
      // ack voltar pra já pedir câmera/mic sem atraso extra).
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", { callId: res.callId, candidate: event.candidate.toJSON() });
        }
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptCall = useCallback(async () => {
    const socket = socketRef.current;
    const auth = currentAuthRef.current;
    const callId = callIdRef.current;
    if (!socket || !auth || !callId) return;
    setError(null);
    setPhase("connecting");

    const [iceServers, stream] = await Promise.all([fetchIceServers(auth.headers), getLocalMedia()]);
    const pc = buildPeerConnection(iceServers, socket, callId);
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    pcRef.current = pc;

    socket.emit("call:accept", { callId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const declineCall = useCallback(() => {
    const socket = socketRef.current;
    const callId = callIdRef.current;
    if (socket && callId) socket.emit("call:decline", { callId });
    cleanup("idle", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelCall = useCallback(() => {
    const socket = socketRef.current;
    const callId = callIdRef.current;
    if (socket && callId) socket.emit("call:cancel", { callId });
    cleanup("idle", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hangUp = useCallback(() => {
    const socket = socketRef.current;
    const callId = callIdRef.current;
    if (socket && callId) socket.emit("call:hangup", { callId, reason: "hangup" });
    cleanup("idle", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStream?.getAudioTracks().forEach((track) => (track.enabled = !next));
      return next;
    });
  }, [localStream]);

  const toggleCamera = useCallback(() => {
    setCameraOff((prev) => {
      const next = !prev;
      localStream?.getVideoTracks().forEach((track) => (track.enabled = !next));
      return next;
    });
  }, [localStream]);

  const flipCamera = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !localStream) return;
    facingModeRef.current = facingModeRef.current === "user" ? "environment" : "user";
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facingModeRef.current },
      audio: false,
    });
    const newTrack = newStream.getVideoTracks()[0];
    const sender = pc.getSenders().find((s) => s.track?.kind === "video");
    await sender?.replaceTrack(newTrack);
    const oldTrack = localStream.getVideoTracks()[0];
    if (oldTrack) {
      localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    localStream.addTrack(newTrack);
    setLocalStream(new MediaStream(localStream.getTracks()));
  }, [localStream]);

  return {
    phase,
    incomingCall,
    outgoingCalleeName,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    endedReason,
    error,
    startCall,
    acceptCall,
    declineCall,
    cancelCall,
    hangUp,
    toggleMute,
    toggleCamera,
    flipCamera,
  };
}
