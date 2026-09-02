import { useRef } from 'react';
import { Paperclip } from 'lucide-react';

// Mesmos limites do backend (ver PHOTO_MAX_BYTES/VIDEO_MAX_BYTES em
// artifacts/api-server/src/lib/mediaStorage.ts) — checar aqui evita
// mandar um arquivo grande pela rede só pra descobrir na resposta que ele
// foi rejeitado.
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime';

export function AttachmentPicker({
  onSelect,
  onError,
}: {
  onSelect: (file: File) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        data-testid="input-attachment-file"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (!file) return;
          const isVideo = file.type.startsWith('video/');
          const limit = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
          if (file.size > limit) {
            onError(
              isVideo
                ? 'Esse vídeo passa de 60MB — escolha um menor.'
                : 'Essa foto passa de 12MB — escolha uma menor.',
            );
            return;
          }
          onSelect(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Anexar foto ou vídeo"
        data-testid="button-attachment-picker"
        className="grid size-11 shrink-0 place-items-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
      >
        <Paperclip size={18} />
      </button>
    </>
  );
}
