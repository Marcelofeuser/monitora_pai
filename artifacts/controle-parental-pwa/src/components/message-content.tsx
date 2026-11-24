import { useEffect, useState } from 'react';
import { useAuthedMediaUrl } from '@/lib/media';
import { tx } from '@/lib/i18n';

export type ChatMessageLike = {
  type: string;
  textContent: string | null;
  contentUrl: string | null;
};

const STICKER_PREFIX = 'emoji:';

export function isStickerMessage(message: ChatMessageLike): boolean {
  return message.type === 'photo' && (message.contentUrl?.startsWith(STICKER_PREFIX) ?? false);
}

function StickerContent({ contentUrl }: { contentUrl: string }) {
  const emoji = contentUrl.slice(STICKER_PREFIX.length);
  return (
    <span className="text-6xl leading-none" role="img" aria-label={tx('Figurinha')}>
      {emoji}
    </span>
  );
}

function PhotoContent({ contentUrl, authHeaders }: { contentUrl: string; authHeaders: HeadersInit }) {
  const { url, error } = useAuthedMediaUrl(contentUrl, authHeaders);
  const [open, setOpen] = useState(false);
  if (error) {
    return <p className="text-xs text-[hsl(var(--destructive))]">{tx('Não foi possível carregar a foto.')}</p>;
  }
  if (!url) {
    return (
      <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-[hsl(var(--muted)/.6)] text-xs text-[hsl(var(--muted-foreground))]">
        {tx('Carregando foto…')}
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        aria-label={tx('Abrir foto em tela cheia')}
        data-testid="button-open-photo"
      >
        <img src={url} alt={tx('Foto enviada no chat')} className="max-h-64 max-w-full rounded-lg object-cover" />
      </button>
      {open ? <PhotoLightbox url={url} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Foto em tela cheia. Clique fora, no X ou Esc fecha; pinça do navegador amplia. */
function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tx('Foto em tela cheia')}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-2"
      style={{ touchAction: 'pinch-zoom' }}
      onClick={onClose}
      data-testid="dialog-photo"
    >
      <img
        src={url}
        alt={tx('Foto em tela cheia')}
        className="max-h-full max-w-full object-contain"
        onClick={(event) => event.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/20 text-xl font-bold text-white"
        aria-label={tx('Fechar foto')}
        data-testid="button-close-photo"
      >
        ✕
      </button>
    </div>
  );
}

function VideoContent({ contentUrl, authHeaders }: { contentUrl: string; authHeaders: HeadersInit }) {
  const { url, error } = useAuthedMediaUrl(contentUrl, authHeaders);
  if (error) {
    return <p className="text-xs text-[hsl(var(--destructive))]">{tx('Não foi possível carregar o vídeo.')}</p>;
  }
  if (!url) {
    return (
      <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-[hsl(var(--muted)/.6)] text-xs text-[hsl(var(--muted-foreground))]">
        {tx('Carregando vídeo…')}
      </div>
    );
  }
  // eslint-disable-next-line jsx-a11y/media-has-caption -- vídeos de chat pessoal, sem legendas
  return <video src={url} controls className="max-h-64 max-w-full rounded-lg" />;
}

function AudioContent({ contentUrl, authHeaders }: { contentUrl: string; authHeaders: HeadersInit }) {
  const { url, error } = useAuthedMediaUrl(contentUrl, authHeaders);
  if (error) {
    return <p className="text-xs text-[hsl(var(--destructive))]">{tx('Não foi possível carregar o áudio.')}</p>;
  }
  if (!url) {
    return <p className="text-xs text-[hsl(var(--muted-foreground))]">{tx('Carregando áudio…')}</p>;
  }
  // eslint-disable-next-line jsx-a11y/media-has-caption -- áudio de chat pessoal, sem legendas
  return <audio src={url} controls className="h-10 max-w-full" />;
}

/**
 * Renderiza o conteúdo de UMA mensagem (texto, foto, vídeo ou figurinha).
 * O balão (cor de fundo, alinhamento, timestamp) fica por conta de quem
 * chama — este componente só cuida do que tem dentro. authHeaders é
 * repassado pro fetch autenticado de foto/vídeo (Bearer do Clerk pro
 * Responsável, X-Child-Token pra Criança — ver PrivateMessagesList.tsx).
 */
export function MessageContent({
  message,
  authHeaders,
}: {
  message: ChatMessageLike;
  authHeaders: HeadersInit;
}) {
  if (isStickerMessage(message) && message.contentUrl) {
    return <StickerContent contentUrl={message.contentUrl} />;
  }
  if (message.type === 'photo' && message.contentUrl) {
    return (
      <div className="flex flex-col gap-1.5">
        <PhotoContent contentUrl={message.contentUrl} authHeaders={authHeaders} />
        {message.textContent && <p>{message.textContent}</p>}
      </div>
    );
  }
  if (message.type === 'video' && message.contentUrl) {
    return (
      <div className="flex flex-col gap-1.5">
        <VideoContent contentUrl={message.contentUrl} authHeaders={authHeaders} />
        {message.textContent && <p>{message.textContent}</p>}
      </div>
    );
  }
  if (message.type === 'audio' && message.contentUrl) {
    return <AudioContent contentUrl={message.contentUrl} authHeaders={authHeaders} />;
  }
  return <>{message.textContent}</>;
}
