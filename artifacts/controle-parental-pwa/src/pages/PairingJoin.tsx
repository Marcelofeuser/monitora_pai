import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { confirmPairing } from '@/lib/pairing-api';
import { reportLocation } from '@/lib/location-api';
import { fetchChildPrivateConversation, sendChildPrivateMessage } from '@/lib/child-conversations-api';
import type { PrivateMessage } from '@/lib/child-conversations-api';

/**
 * Rota /join?token=... — é para onde o link do QR code aponta.
 * Esta é a tela que estava faltando: antes não existia NENHUMA rota que
 * recebesse o token escaneado, por isso o QR "não aprovava nada".
 *
 * Também é, hoje, a única "casa" da Criança no app (ela não tem conta
 * Clerk, então não navega pelo resto do PWA) — por isso, além de
 * confirmar o pareamento, esta tela também é onde ela reabre o app depois
 * (sem token na URL) e onde ela conversa com o Responsável.
 */

// Chaves usadas pra guardar a credencial e a identidade do aparelho da
// Criança. Ela não tem conta Clerk — o token é o que autentica o envio de
// localização e as mensagens (ver lib/location-api.ts,
// lib/child-conversations-api.ts e middlewares/childAuth.ts no backend).
// O childId é usado só no frontend, pra saber quais mensagens do histórico
// são "minhas" (a Criança) na conversa privada.
const DEVICE_TOKEN_KEY = 'amparo-child-device-token';
const CHILD_NAME_KEY = 'amparo-child-name';
const CHILD_ID_KEY = 'amparo-child-id';

export function PairingJoin() {
  const [status, setStatus] = useState<'checking' | 'success' | 'error' | 'no_token'>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [childName, setChildName] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);
  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<'idle' | 'asking' | 'shared' | 'error'>('idle');
  const [shareError, setShareError] = useState<string | null>(null);

  const [privateMessages, setPrivateMessages] = useState<PrivateMessage[]>([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [privateDraft, setPrivateDraft] = useState('');
  const [privateSending, setPrivateSending] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    // Sem token na URL: não é necessariamente um link quebrado — é o caso
    // normal de a Criança reabrir o app depois (favorito, aba antiga, etc).
    // Antes, isso sempre caía em "Link incompleto", mesmo pra quem já
    // tinha pareado — o aparelho não "saía" dali de outro jeito. Agora,
    // se já existe uma credencial salva deste aparelho, usa ela direto.
    if (!token) {
      let storedToken: string | null = null;
      let storedName: string | null = null;
      let storedChildId: string | null = null;
      try {
        storedToken = localStorage.getItem(DEVICE_TOKEN_KEY);
        storedName = localStorage.getItem(CHILD_NAME_KEY);
        storedChildId = localStorage.getItem(CHILD_ID_KEY);
      } catch {
        // localStorage pode falhar (modo privado, etc.).
      }
      if (storedToken) {
        setDeviceToken(storedToken);
        setChildName(storedName);
        setChildId(storedChildId);
        setStatus('success');
      } else {
        setStatus('no_token');
      }
      return;
    }

    confirmPairing(token)
      .then((result) => {
        setChildName(result.childName);
        setChildId(result.childUserId);
        setDeviceToken(result.deviceToken);
        try {
          localStorage.setItem(DEVICE_TOKEN_KEY, result.deviceToken);
          localStorage.setItem(CHILD_NAME_KEY, result.childName);
          localStorage.setItem(CHILD_ID_KEY, result.childUserId);
        } catch {
          // localStorage pode falhar (modo privado, etc.) — não bloqueia o fluxo.
        }
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Erro desconhecido.');
      });
  }, []);

  // Canal privado com o Responsável — carrega assim que o pareamento (ou a
  // restauração da credencial salva) termina com sucesso. Antes, essa tela
  // não tinha NENHUM jeito de escrever mensagem — só o botão de
  // localização — e não tinha pra onde ir depois. Agora tem a conversa
  // aqui mesmo.
  useEffect(() => {
    if (status !== 'success' || !deviceToken) return;
    let cancelled = false;
    async function loadPrivate() {
      setPrivateLoading(true);
      setPrivateError(null);
      try {
        const data = await fetchChildPrivateConversation(deviceToken!);
        if (!cancelled) setPrivateMessages(data.messages);
      } catch (err) {
        if (!cancelled) setPrivateError(err instanceof Error ? err.message : 'Erro ao carregar a conversa.');
      } finally {
        if (!cancelled) setPrivateLoading(false);
      }
    }
    loadPrivate();
    return () => {
      cancelled = true;
    };
  }, [status, deviceToken]);

  async function sendPrivate(event: FormEvent) {
    event.preventDefault();
    const text = privateDraft.trim();
    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!text || !token || privateSending) return;
    setPrivateSending(true);
    setPrivateError(null);
    try {
      const message = await sendChildPrivateMessage(token, text);
      setPrivateMessages((current) => [...current, message]);
      setPrivateDraft('');
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setPrivateSending(false);
    }
  }

  function shareLocation() {
    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      setShareStatus('error');
      setShareError('Não foi possível encontrar a credencial deste aparelho.');
      return;
    }
    if (!('geolocation' in navigator)) {
      setShareStatus('error');
      setShareError('Este navegador não suporta localização.');
      return;
    }
    setShareStatus('asking');
    setShareError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        reportLocation(token, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? undefined,
        })
          .then(() => setShareStatus('shared'))
          .catch((err) => {
            setShareStatus('error');
            setShareError(err instanceof Error ? err.message : 'Erro desconhecido.');
          });
      },
      (err) => {
        setShareStatus('error');
        setShareError(
          err.code === err.PERMISSION_DENIED
            ? 'Permissão de localização negada.'
            : 'Não foi possível obter a localização.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      {status === 'checking' && <p>Confirmando vínculo com o Responsável…</p>}

      {status === 'no_token' && (
        <>
          <h1 className="text-lg font-bold">Link incompleto</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Este link não tem um código de pareamento válido. Peça para o Responsável gerar um
            novo QR code.
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 className="text-lg font-bold">Não foi possível vincular</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            O código pode ter expirado (válido por 15 minutos) ou já foi usado. Peça para o
            Responsável gerar um novo QR code.
          </p>
          {errorMessage && (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Detalhe técnico: {errorMessage}</p>
          )}
        </>
      )}

      {status === 'success' && (
        <>
          <h1 className="text-lg font-bold">Oi, {childName ?? 'tudo certo'}!</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Seu aparelho já está vinculado ao Responsável. Você já pode conversar e compartilhar
            sua localização por aqui.
          </p>

          <div className="mt-4 w-full rounded-lg border border-[hsl(var(--border))] p-4 text-left">
            <h2 className="text-base font-semibold">Conversa com o Responsável</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Só vocês dois veem essa conversa.
            </p>
            <div className="mt-3 flex max-h-72 min-h-[120px] flex-col gap-2 overflow-y-auto rounded-md bg-[hsl(var(--muted)/.4)] p-3">
              {privateLoading && privateMessages.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
              ) : privateMessages.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhuma mensagem ainda. Diga oi!</p>
              ) : (
                privateMessages.map((message) => {
                  const fromMe = childId !== null && message.senderId === childId;
                  return (
                    <div
                      key={message.id}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))] shadow-sm'}`}
                    >
                      {message.textContent}
                    </div>
                  );
                })
              )}
            </div>
            {privateError && <p className="mt-2 text-sm text-red-600">{privateError}</p>}
            <form onSubmit={sendPrivate} className="mt-3 flex items-center gap-2">
              <input
                value={privateDraft}
                onChange={(event) => setPrivateDraft(event.target.value)}
                placeholder="Escreva uma mensagem…"
                className="h-11 flex-1 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
              />
              <button
                type="submit"
                disabled={!privateDraft.trim() || privateSending}
                className="h-11 rounded-md bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
              >
                {privateSending ? '…' : 'Enviar'}
              </button>
            </form>
          </div>

          <div className="mt-4 w-full rounded-lg border border-[hsl(var(--border))] p-4 text-left">
            <h2 className="text-base font-semibold">Compartilhar minha localização</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Só acontece quando você escolhe — sem rastreamento em segundo plano. Toque no botão
              sempre que quiser que o Responsável veja onde você está agora.
            </p>
            <button
              type="button"
              onClick={shareLocation}
              disabled={shareStatus === 'asking'}
              className="mt-3 w-full rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
            >
              {shareStatus === 'asking'
                ? 'Pedindo permissão…'
                : shareStatus === 'shared'
                  ? 'Compartilhado! Compartilhar de novo'
                  : 'Compartilhar minha localização agora'}
            </button>
            {shareStatus === 'shared' && (
              <p className="mt-2 text-sm text-green-600">Localização enviada com sucesso.</p>
            )}
            {shareStatus === 'error' && shareError && (
              <p className="mt-2 text-sm text-red-600">{shareError}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default PairingJoin;
