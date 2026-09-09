import { useEffect, useRef } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { CallAvatar } from "./CallAvatar";

type Props = {
  callerName: string;
  onAccept: () => void;
  onDecline: () => void;
};

// Tela cheia de chamada recebida -- vibração em loop até o usuário aceitar
// ou recusar. Compartilhada pelos três papéis via useCall (ver
// hooks/use-call.ts). Sem áudio de toque próprio na v1 (evita adicionar um
// arquivo de mídia novo ao bundle só pra isso) -- a vibração + a própria
// notificação push (quando o app não está em primeiro plano) já cobrem o
// aviso.
export function IncomingCallOverlay({ callerName, onAccept, onDecline }: Props) {
  const vibrateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if ("vibrate" in navigator) {
      navigator.vibrate?.([400, 200, 400]);
      vibrateIntervalRef.current = setInterval(() => navigator.vibrate?.([400, 200, 400]), 2000);
    }
    return () => {
      if (vibrateIntervalRef.current) clearInterval(vibrateIntervalRef.current);
      navigator.vibrate?.(0);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[hsl(var(--background))] px-6 py-14">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <CallAvatar name={callerName} />
        <p className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Chamada recebida
        </p>
        <h1 className="text-2xl font-bold">{callerName}</h1>
      </div>
      <div className="flex w-full items-center justify-center gap-16">
        <button
          type="button"
          onClick={onDecline}
          data-testid="button-decline-call"
          aria-label="Recusar chamada"
          className="grid size-16 place-items-center rounded-full bg-red-500 text-white shadow-lg transition-transform active:scale-95"
        >
          <PhoneOff size={26} />
        </button>
        <button
          type="button"
          onClick={onAccept}
          data-testid="button-accept-call"
          aria-label="Atender chamada"
          className="grid size-16 place-items-center rounded-full bg-emerald-500 text-white shadow-lg transition-transform active:scale-95"
        >
          <Phone size={26} />
        </button>
      </div>
    </div>
  );
}
