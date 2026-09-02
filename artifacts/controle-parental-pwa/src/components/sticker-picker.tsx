import { useState } from 'react';
import { Sticker as StickerIcon } from 'lucide-react';
import { ALLOWED_STICKERS } from '@/lib/stickers';

// Mesmo padrão do EmojiPicker (components/emoji-picker.tsx), só que com
// botões maiores e uma lista fechada — uma figurinha é, hoje, um emoji
// grande sem balão ao redor (ver MessageContent), diferente de um emoji
// digitado dentro do texto.
export function StickerPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label="Figurinhas"
        data-testid="button-sticker-picker"
        className="grid size-11 shrink-0 place-items-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
      >
        <StickerIcon size={18} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full right-0 z-20 mb-2 grid max-h-80 w-64 grid-cols-6 gap-1 overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-lg"
            data-testid="panel-sticker-picker"
          >
            {ALLOWED_STICKERS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSelect(emoji);
                  setOpen(false);
                }}
                className="grid size-9 place-items-center rounded text-2xl hover:bg-[hsl(var(--muted))]"
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
