import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { confirmPairing } from '@/lib/pairing-api';
import { reportLocation } from '@/lib/location-api';
import { fetchChildPrivateConversation, sendChildPrivateMessage } from '@/lib/child-conversations-api';
import type { PrivateMessage } from '@/lib/child-conversations-api';
import { ThemeSwitcher } from '@/lib/theme';
import { EmojiPicker } from '@/components/emoji-picker';
import { AttachmentPicker } from '@/components/attachment-picker';
import { StickerPicker } from '@/components/sticker-picker';
import { MessageContent, isStickerMessage } from '@/components/message-content';
import { fetchChildScreenTimeStatus, sendScreenTimeHeartbeat } from '@/lib/screen-time-api';
import type { ChildLockStatus } from '@/lib/screen-time-api';
import { Hourglass } from 'lucide-react';

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
  const [locationStatus, setLocationStatus] = useState<'idle' | 'active' | 'error'>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [lastSharedAt, setLastSharedAt] = useState<Date | null>(null);

  const [privateMessages, setPrivateMessages] = useState<PrivateMessage[]>([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);
  const [privateDraft, setPrivateDraft] = useState('');
  const [privateSending, setPrivateSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [screenLock, setScreenLock] = useState<ChildLockStatus | null>(null);

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
    if ((!text && !pendingFile) || !token || privateSending) return;
    setPrivateSending(true);
    setPrivateError(null);
    try {
      const message = pendingFile
        ? await sendChildPrivateMessage(token, { file: pendingFile, caption: text || undefined })
        : await sendChildPrivateMessage(token, { textContent: text });
      setPrivateMessages((current) => [...current, message]);
      setPrivateDraft('');
      setPendingFile(null);
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setPrivateSending(false);
    }
  }

  // Figurinha manda na hora, sem passar pelo composer.
  async function sendSticker(emoji: string) {
    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token || privateSending) return;
    setPrivateSending(true);
    setPrivateError(null);
    try {
      const message = await sendChildPrivateMessage(token, { stickerEmoji: emoji });
      setPrivateMessages((current) => [...current, message]);
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : 'Erro ao enviar figurinha.');
    } finally {
      setPrivateSending(false);
    }
  }

  // Localização automática: antes exigia a Criança tocar num botão toda
  // vez. Agora, enquanto o app dela está aberto, manda a posição sozinho
  // (primeira vez assim que a tela carrega, depois a cada 5 minutos) — sem
  // pedir confirmação a cada envio. Um PWA de navegador não roda com o app
  // fechado, então isso só funciona com a aba aberta; é a única forma real
  // de "automático" que dá pra fazer sem virar um app nativo.
  useEffect(() => {
    if (status !== 'success') return;
    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) return;
    if (!('geolocation' in navigator)) {
      setLocationStatus('error');
      setLocationError('Este navegador não suporta localização.');
      return;
    }

    let cancelled = false;

    function reportOnce() {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          reportLocation(token!, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy ?? undefined,
          })
            .then(() => {
              if (cancelled) return;
              setLocationStatus('active');
              setLocationError(null);
              setLastSharedAt(new Date());
            })
            .catch((err) => {
              if (cancelled) return;
              setLocationStatus('error');
              setLocationError(err instanceof Error ? err.message : 'Erro desconhecido.');
            });
        },
        (err) => {
          if (cancelled) return;
          setLocationStatus('error');
          setLocationError(
            err.code === err.PERMISSION_DENIED
              ? 'Permissão de localização negada.'
              : 'Não foi possível obter a localização.',
          );
        },
        { enableHighAccuracy: true, timeout: 15000 },
      );
    }

    reportOnce();
    const intervalId = window.setInterval(reportOnce, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [status, deviceToken]);

  // Tempo de uso (item 11): manda um "heartbeat" a cada minuto enquanto o
  // app dela está aberto — cada um soma 1 minuto no total de hoje no
  // backend (ver POST /api/child/screen-time/heartbeat). A resposta já vem
  // com o status de bloqueio atualizado, então a tela de bloqueio aparece
  // no minuto exato em que o limite estoura, sem precisar de uma consulta
  // separada.
  useEffect(() => {
    if (status !== 'success') return;
    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) return;

    let cancelled = false;

    fetchChildScreenTimeStatus(token)
      .then((data) => {
        if (!cancelled) setScreenLock(data);
      })
      .catch(() => undefined);

    function beat() {
      sendScreenTimeHeartbeat(token!)
        .then((data) => {
          if (!cancelled) setScreenLock(data);
        })
        .catch(() => undefined);
    }

    const intervalId = window.setInterval(beat, 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [status, deviceToken]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      {/* Único ajuste que a Criança pode mexer além de conversar e
          compartilhar localização: o tema claro/escuro. */}
      {status === 'success' && (
        <div className="flex w-full justify-end">
          <ThemeSwitcher />
        </div>
      )}
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

          {screenLock?.locked ? (
            <div className="mt-4 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)] p-6 text-center" data-testid="panel-screen-time-locked">
              <Hourglass className="mx-auto text-[hsl(var(--muted-foreground))]" size={28} />
              <h2 className="mt-3 text-base font-semibold">
                {screenLock.lockReason === 'manual' ? 'Seu Responsável bloqueou o app por enquanto' : 'Seu tempo de uso de hoje acabou'}
              </h2>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                {screenLock.lockReason === 'manual'
                  ? 'Fale com ele se precisar usar o chat agora.'
                  : 'Volte amanhã, ou peça pro seu Responsável liberar mais tempo hoje.'}
              </p>
            </div>
          ) : (
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
                  const sticker = isStickerMessage(message);
                  const bubbleClass = sticker
                    ? `${fromMe ? 'self-end' : 'self-start'}`
                    : `rounded-2xl px-3 py-2 shadow-sm ${fromMe ? 'self-end bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'self-start bg-[hsl(var(--card))]'}`;
                  return (
                    <div key={message.id} className={`max-w-[85%] text-sm leading-6 ${bubbleClass}`}>
                      <MessageContent message={message} authHeaders={{ 'X-Child-Token': deviceToken ?? '' }} />
                    </div>
                  );
                })
              )}
            </div>
            {privateError && <p className="mt-2 text-sm text-red-600">{privateError}</p>}
            {attachError && <p className="mt-2 text-sm text-red-600">{attachError}</p>}
            {pendingFile && (
              <div className="mt-2 flex items-center gap-2 rounded-md bg-[hsl(var(--muted)/.6)] px-3 py-2 text-xs font-semibold">
                {pendingFile.type.startsWith('video/') ? 'Vídeo selecionado:' : 'Foto selecionada:'} {pendingFile.name}
                <button
                  type="button"
                  onClick={() => setPendingFile(null)}
                  aria-label="Remover anexo"
                  className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  ×
                </button>
              </div>
            )}
            <form onSubmit={sendPrivate} className="mt-3 flex items-center gap-2">
              <EmojiPicker onSelect={(emoji) => setPrivateDraft((current) => current + emoji)} />
              <AttachmentPicker
                onSelect={(file) => {
                  setAttachError(null);
                  setPendingFile(file);
                }}
                onError={setAttachError}
              />
              <StickerPicker onSelect={(emoji) => { void sendSticker(emoji); }} />
              <input
                value={privateDraft}
                onChange={(event) => setPrivateDraft(event.target.value)}
                placeholder={pendingFile ? 'Legenda (opcional)…' : 'Escreva uma mensagem…'}
                className="h-11 flex-1 rounded-md border border-[hsl(var(--border))] bg-transparent px-3 text-sm outline-none focus:border-[hsl(var(--primary))]"
              />
              <button
                type="submit"
                disabled={(!privateDraft.trim() && !pendingFile) || privateSending}
                className="h-11 rounded-md bg-[hsl(var(--primary))] px-4 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
              >
                {privateSending ? '…' : 'Enviar'}
              </button>
            </form>
          </div>
          )}

          <div className="mt-4 w-full rounded-lg border border-[hsl(var(--border))] p-4 text-left">
            <h2 className="text-base font-semibold">Localização</h2>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Fica ligada automaticamente enquanto este app estiver aberto — o Responsável sempre
              vê onde você está agora, sem você precisar tocar em nada.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span
                className={`size-2.5 rounded-full ${locationStatus === 'active' ? 'bg-green-500' : locationStatus === 'error' ? 'bg-red-500' : 'bg-[hsl(var(--muted-foreground))]'}`}
              />
              {locationStatus === 'active' && (
                <span className="text-green-700">
                  Localização ativa{lastSharedAt ? ` · atualizada ${lastSharedAt.toLocaleTimeString('pt-BR')}` : ''}
                </span>
              )}
              {locationStatus === 'idle' && <span className="text-[hsl(var(--muted-foreground))]">Ativando…</span>}
              {locationStatus === 'error' && <span className="text-red-600">{locationError}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default PairingJoin;
