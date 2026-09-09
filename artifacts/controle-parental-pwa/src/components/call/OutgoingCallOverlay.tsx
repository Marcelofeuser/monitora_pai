import { PhoneOff } from "lucide-react";
import { CallAvatar } from "./CallAvatar";

type Props = {
  calleeName: string;
  onCancel: () => void;
};

// Tela cheia "chamando <nome>..." -- some sozinha quando o outro lado
// atende (o hook troca a fase pra 'connecting'/'active') ou quando o
// servidor confirma recusa/timeout/ocupado (ver hooks/use-call.ts).
export function OutgoingCallOverlay({ calleeName, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-[hsl(var(--background))] px-6 py-14">
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <CallAvatar name={calleeName} />
        <p className="text-xs font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
          Chamando…
        </p>
        <h1 className="text-2xl font-bold">{calleeName}</h1>
      </div>
      <button
        type="button"
        onClick={onCancel}
        data-testid="button-cancel-call"
        aria-label="Cancelar chamada"
        className="grid size-16 place-items-center rounded-full bg-red-500 text-white shadow-lg transition-transform active:scale-95"
      >
        <PhoneOff size={26} />
      </button>
    </div>
  );
}
