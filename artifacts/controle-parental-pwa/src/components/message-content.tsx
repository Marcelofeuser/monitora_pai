import { useAuthedMediaUrl } from '@/lib/media';

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
    <span className="text-6xl leading-none" role="img" aria-label="Figurinha">
      {emoji}
    </span>
  );
}

function PhotoContent({ contentUrl, authHeaders }: { contentUrl: string; authHeaders: HeadersInit }) {
  const { url, error } = useAuthedMediaUrl(contentUrl, authHeaders);
  if (error) {
    return <p className="text-xs text-[hsl(var(--destructive))]">Não foi possível carregar a foto.</p>;
  }
  if (!url) {
    return (
      <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-[hsl(var(--muted)/.6)] text-xs text-[hsl(var(--muted-foreground))]">
        Carregando foto…
      </div>
    );
  }
  return <img src={url} alt="Foto enviada no chat" className="max-h-64 max-w-full rounded-lg object-cover" />;
}

function VideoContent({ contentUrl, authHeaders }: { contentUrl: string; authHeaders: HeadersInit }) {
  const { url, error } = useAuthedMediaUrl(contentUrl, authHeaders);
  if (error) {
    return <p className="text-xs text-[hsl(var(--destructive))]">Não foi possível carregar o vídeo.</p>;
  }
  if (!url) {
    return (
      <div className="flex h-40 w-56 items-center justify-center rounded-lg bg-[hsl(var(--muted)/.6)] text-xs text-[hsl(var(--muted-foreground))]">
        Carregando vídeo…
      </div>
    );
  }
  // eslint-disable-next-line jsx-a11y/media-has-caption -- vídeos de chat pessoal, sem legendas
  return <video src={url} controls className="max-h-64 max-w-full rounded-lg" />;
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
  return <>{message.textContent}</>;
}
