import type { UseCallResult } from "@/hooks/use-call";
import { IncomingCallOverlay } from "./IncomingCallOverlay";
import { OutgoingCallOverlay } from "./OutgoingCallOverlay";
import { InCallOverlay } from "./InCallOverlay";

const ENDED_LABEL: Record<string, string> = {
  declined: "Chamada recusada.",
  missed: "Chamada não atendida.",
  busy: "A pessoa já estava em outra chamada.",
  canceled: "Chamada cancelada.",
  failed: "A chamada caiu.",
  hangup: "Chamada encerrada.",
};

/**
 * Único ponto de renderização da UI de chamada -- cada uma das três telas
 * de chat (MyChat em App.tsx, ContactChat.tsx, PairingJoin.tsx) só precisa
 * renderizar <CallOverlays call={useCall(identity)} /> uma vez; o resto é
 * decidido pela fase (ver hooks/use-call.ts). Fica invisível (retorna null)
 * em 'idle'.
 */
export function CallOverlays({ call, peerName }: { call: UseCallResult; peerName?: string }) {
  if (call.phase === "ringing-incoming" && call.incomingCall) {
    return (
      <IncomingCallOverlay
        callerName={call.incomingCall.callerName}
        onAccept={call.acceptCall}
        onDecline={call.declineCall}
      />
    );
  }

  if (call.phase === "ringing-outgoing") {
    return <OutgoingCallOverlay calleeName={call.outgoingCalleeName ?? peerName ?? "…"} onCancel={call.cancelCall} />;
  }

  if (call.phase === "connecting" || call.phase === "active") {
    return (
      <InCallOverlay
        peerName={call.outgoingCalleeName ?? call.incomingCall?.callerName ?? peerName ?? ""}
        connecting={call.phase === "connecting"}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        muted={call.muted}
        cameraOff={call.cameraOff}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
        onFlipCamera={call.flipCamera}
        onHangUp={call.hangUp}
      />
    );
  }

  if (call.phase === "ended" && call.endedReason) {
    return (
      <div className="fixed inset-x-0 top-4 z-[100] mx-auto w-fit rounded-full bg-[hsl(var(--card))] px-4 py-2 text-sm font-medium shadow-card">
        {ENDED_LABEL[call.endedReason] ?? "Chamada encerrada."}
      </div>
    );
  }

  if (call.error) {
    return (
      <div className="fixed inset-x-0 top-4 z-[100] mx-auto w-fit rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white shadow-card">
        {call.error}
      </div>
    );
  }

  return null;
}
