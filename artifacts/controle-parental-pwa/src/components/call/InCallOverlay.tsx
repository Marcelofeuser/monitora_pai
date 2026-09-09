import { useEffect, useRef } from "react";
import { Mic, MicOff, PhoneOff, RotateCcw, Video, VideoOff } from "lucide-react";

type Props = {
  peerName: string;
  connecting: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onFlipCamera: () => void;
  onHangUp: () => void;
};

// Chamada em andamento -- vídeo remoto em tela cheia, local em PiP no
// canto (mesmo layout de qualquer app de chamada). `connecting` mostra um
// rótulo "Conectando..." em cima do vídeo remoto (ainda preto) enquanto o
// ICE não fecha -- ver oniceconnectionstatechange em hooks/use-call.ts.
export function InCallOverlay({
  peerName,
  connecting,
  localStream,
  remoteStream,
  muted,
  cameraOff,
  onToggleMute,
  onToggleCamera,
  onFlipCamera,
  onHangUp,
}: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="relative flex-1">
        <video ref={remoteVideoRef} autoPlay playsInline className="size-full object-cover" />
        {connecting && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 text-white">
            <p className="text-sm font-medium">Conectando com {peerName}…</p>
          </div>
        )}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute right-4 top-4 h-40 w-28 rounded-2xl border border-white/20 object-cover shadow-lg"
        />
        <p className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1 text-xs font-bold text-white">
          {peerName}
        </p>
      </div>
      <div className="flex items-center justify-center gap-6 bg-black/90 px-6 py-6">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? "Ativar microfone" : "Silenciar microfone"}
          data-testid="button-toggle-mute"
          className={`grid size-14 place-items-center rounded-full text-white transition-colors ${muted ? "bg-white/20" : "bg-white/10"}`}
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button
          type="button"
          onClick={onHangUp}
          aria-label="Encerrar chamada"
          data-testid="button-hangup-call"
          className="grid size-16 place-items-center rounded-full bg-red-500 text-white shadow-lg transition-transform active:scale-95"
        >
          <PhoneOff size={26} />
        </button>
        <button
          type="button"
          onClick={onToggleCamera}
          aria-label={cameraOff ? "Ligar câmera" : "Desligar câmera"}
          data-testid="button-toggle-camera"
          className={`grid size-14 place-items-center rounded-full text-white transition-colors ${cameraOff ? "bg-white/20" : "bg-white/10"}`}
        >
          {cameraOff ? <VideoOff size={22} /> : <Video size={22} />}
        </button>
        <button
          type="button"
          onClick={onFlipCamera}
          aria-label="Trocar câmera"
          data-testid="button-flip-camera"
          className="grid size-14 place-items-center rounded-full bg-white/10 text-white"
        >
          <RotateCcw size={22} />
        </button>
      </div>
    </div>
  );
}
