import { useState } from 'react';
import { Smile } from 'lucide-react';

// Seletor de emoji simples e leve — sem biblioteca externa, só um grid
// fixo dos emojis mais comuns. Usado nos dois lados da conversa privada
// (Responsável em App.tsx, Criança em PairingJoin.tsx).
const COMMON_EMOJIS = [
  '😀', '😂', '🥰', '😍', '😘', '😉', '😊', '🙂', '😎', '🤔',
  '😢', '😭', '😡', '😱', '🥳', '😴', '🙄', '😅', '🤗', '🤩',
  '👍', '👎', '👏', '🙏', '💪', '✌️', '🤝', '👋', '🙌', '🤞',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💕', '💯', '✨',
  '🎉', '🎂', '⚽', '🎮', '📚', '🎵', '🐶', '🐱', '🌈', '☀️',
];

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Emojis"
        data-testid="button-emoji-picker"
        className="grid size-11 shrink-0 place-items-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
      >
        <Smile size={18} />
      </button>
      {open && (
        <>
          {/* Fecha o painel ao clicar fora, sem precisar de lib de outside-click. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full right-0 z-20 mb-2 grid w-64 grid-cols-10 gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-lg"
            data-testid="panel-emoji-picker"
          >
            {COMMON_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                className="grid size-6 place-items-center rounded text-lg hover:bg-[hsl(var(--muted))]"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
