import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';

// Hook genérico de "segurar e prender" (pedido do Marcelo: 2 segundos) usado
// pra abrir os menus de ação do balão de grupo e da bolinha de contato.
// Cancela se o dedo/mouse mover demais antes do tempo -- evita disparo
// acidental durante um scroll da lista -- e evita que o onClick normal do
// item (abrir o chat) dispare junto quando o long-press já abriu o menu.
const LONG_PRESS_MS = 2000;
const MOVE_CANCEL_PX = 10;

export function useLongPress(onLongPress: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (x: number, y: number) => {
      firedRef.current = false;
      startPos.current = { x, y };
      clear();
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [clear, onLongPress],
  );

  const move = useCallback(
    (x: number, y: number) => {
      if (!startPos.current) return;
      const dx = Math.abs(x - startPos.current.x);
      const dy = Math.abs(y - startPos.current.y);
      if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clear();
    },
    [clear],
  );

  return {
    onPointerDown: (event: ReactPointerEvent) => start(event.clientX, event.clientY),
    onPointerMove: (event: ReactPointerEvent) => move(event.clientX, event.clientY),
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    // Sem isso, ao completar os 2s o navegador ainda dispara o onClick do
    // botão logo depois de soltar o dedo, abrindo o chat por trás do menu.
    onClickCapture: (event: ReactMouseEvent) => {
      if (firedRef.current) {
        event.preventDefault();
        event.stopPropagation();
        firedRef.current = false;
      }
    },
  };
}
