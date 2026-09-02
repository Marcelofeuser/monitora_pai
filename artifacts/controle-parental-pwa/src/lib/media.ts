import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? '';

// <img>/<video src> não têm como mandar Authorization nem X-Child-Token —
// e mídia do chat nunca é pública (ver GET /api/media/:filename no
// backend, que sempre confere se quem pediu tem direito de ver aquela
// mensagem). Por isso a gente busca o arquivo com fetch autenticado e
// transforma a resposta num object URL. Um cache em memória evita
// rebuscar a mesma mídia sempre que o componente remonta (ex: trocar de
// aba e voltar pro chat).
const blobUrlCache = new Map<string, string>();

export function resolveMediaUrl(contentUrl: string): string {
  return contentUrl.startsWith('http') ? contentUrl : `${API_URL}${contentUrl}`;
}

export function useAuthedMediaUrl(
  contentUrl: string | null,
  headers: HeadersInit,
): { url: string | null; error: string | null } {
  const [url, setUrl] = useState<string | null>(
    contentUrl ? (blobUrlCache.get(contentUrl) ?? null) : null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contentUrl) return;
    const cached = blobUrlCache.get(contentUrl);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    fetch(resolveMediaUrl(contentUrl), { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`media_fetch_failed_${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        blobUrlCache.set(contentUrl, objectUrl);
        setUrl(objectUrl);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar mídia.');
      });
    return () => {
      cancelled = true;
    };
    // Propositalmente não inclui `headers` nas deps: o objeto muda de
    // identidade a cada render do chamador, mas o token que ele carrega é
    // o mesmo durante a vida da mensagem — só contentUrl deve disparar
    // uma nova busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentUrl]);

  return { url, error };
}
