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
import { AudioRecorderButton } from '@/components/audio-recorder-button';
import { MessageContent, isStickerMessage } from '@/components/message-content';
import { fetchChildScreenTimeStatus, sendScreenTimeHeartbeat } from '@/lib/screen-time-api';
import type { ChildLockStatus } from '@/lib/screen-time-api';
import { enablePushNotifications, disablePushNotifications, isPushSupported } from '@/lib/push';
import { getRelationshipInfo } from '@/lib/relationship';
import { Hourglass, Bell, BellOff, Sparkles, Send, MapPin } from 'lucide-react';

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
  const [parentName, setParentName] = useState<string | null>(null);
  const [parentRelationship, setParentRelationship] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

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
  // restauração da credencial salva) termina com sucesso, e depois fica
  // atualizando sozinho a cada 5s enquanto a tela estiver aberta. Antes só
  // buscava uma vez — mensagens que o Responsável mandasse depois disso só
  // apareciam se ela recarregasse a página manualmente, o que parecia
  // "mensagem não chega".
  useEffect(() => {
    if (status !== 'success' || !deviceToken) return;
    let cancelled = false;

    async function loadPrivate(showSpinner: boolean) {
      if (showSpinner) setPrivateLoading(true);
      try {
        const data = await fetchChildPrivateConversation(deviceToken!);
        if (!cancelled) {
          setPrivateMessages(data.messages);
          setParentName(data.parentName);
          setParentRelationship(data.parentRelationship);
          setPrivateError(null);
        }
      } catch (err) {
        // Erro num poll silencioso não deve gritar na tela — só na carga
        // inicial, pra não ficar piscando aviso a cada 5s se a rede cair
        // por um instante.
        if (!cancelled && showSpinner) {
          setPrivateError(err instanceof Error ? err.message : 'Erro ao carregar a conversa.');
        }
      } finally {
        if (!cancelled && showSpinner) setPrivateLoading(false);
      }
    }

    loadPrivate(true);
    const intervalId = window.setInterval(() => loadPrivate(false), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
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

  // Áudio grava e manda na hora, mesma lógica da figurinha.
  async function sendAudio(file: File) {
    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token || privateSending) return;
    setPrivateSending(true);
    setPrivateError(null);
    try {
      const message = await sendChildPrivateMessage(token, { file });
      setPrivateMessages((current) => [...current, message]);
    } catch (err) {
      setPrivateError(err instanceof Error ? err.message : 'Erro ao enviar áudio.');
    } finally {
      setPrivateSending(false);
    }
  }

  // Notificações (pedido do Marcelo): a Criança também pode ligar push,
  // pra ser avisada quando o Responsável mandar mensagem. Mesmo padrão do
  // toggle em Configurações do lado do Responsável — reflete o estado real
  // da assinatura do navegador, não um valor solto guardado à parte.
  useEffect(() => {
    if (status !== 'success' || !isPushSupported()) return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setNotifications(Boolean(subscription));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function toggleNotifications() {
    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token || notificationsBusy) return;
    setNotificationsBusy(true);
    setNotificationsError(null);
    try {
      if (notifications) {
        await disablePushNotifications({ kind: 'child', deviceToken: token });
        setNotifications(false);
      } else {
        await enablePushNotifications({ kind: 'child', deviceToken: token });
        setNotifications(true);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setNotificationsError(
        message === 'permission_denied'
          ? 'Permissão de notificação negada — libere nas configurações do navegador.'
          : message === 'push_not_supported'
            ? 'Este navegador não suporta notificações.'
            : 'Não foi possível ativar as notificações agora.',
      );
    } finally {
      setNotificationsBusy(false);
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

  // Dá ao PWA da Criança uma identidade própria (nome "Amparo Kids" e o
  // ícone da estrelinha, em vez do escudo do Responsável) quando ela usa
  // "Adicionar à Tela de Início" a partir desta tela — pedido do Marcelo
  // depois de instalar o PWA da Criança e ver o ícone/nome do Responsável.
  // Não precisa de link ou domínio separado: o navegador lê o
  // <link rel="manifest">, o <meta apple-mobile-web-app-title> e o
  // <link rel="apple-touch-icon"> presentes no DOM no momento em que a
  // instalação acontece — então trocamos esses elementos só enquanto esta
  // tela (a única "casa" da Criança no app) está montada, e devolvemos o
  // original ao desmontar, caso ela algum dia navegue pra fora daqui.
  useEffect(() => {
    const base = import.meta.env.BASE_URL;

    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const originalManifestHref = manifestLink?.getAttribute('href') ?? null;
    manifestLink?.setAttribute('href', `${base}manifest-child.webmanifest`);

    let titleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const hadTitleMeta = Boolean(titleMeta);
    const originalTitleContent = titleMeta?.getAttribute('content') ?? null;
    if (!titleMeta) {
      titleMeta = document.createElement('meta');
      titleMeta.setAttribute('name', 'apple-mobile-web-app-title');
      document.head.appendChild(titleMeta);
    }
    titleMeta.setAttribute('content', 'Amparo Kids');

    let touchIconLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const hadTouchIconLink = Boolean(touchIconLink);
    const originalTouchIconHref = touchIconLink?.getAttribute('href') ?? null;
    if (!touchIconLink) {
      touchIconLink = document.createElement('link');
      touchIconLink.setAttribute('rel', 'apple-touch-icon');
      document.head.appendChild(touchIconLink);
    }
    touchIconLink.setAttribute('href', `${base}apple-touch-icon-child.png`);

    const originalDocumentTitle = document.title;
    document.title = 'Amparo Kids';

    return () => {
      if (originalManifestHref) manifestLink?.setAttribute('href', originalManifestHref);
      if (hadTitleMeta && originalTitleContent !== null) {
        titleMeta?.setAttribute('content', originalTitleContent);
      } else if (!hadTitleMeta) {
        titleMeta?.remove();
      }
      if (hadTouchIconLink && originalTouchIconHref) {
        touchIconLink?.setAttribute('href', originalTouchIconHref);
      } else if (!hadTouchIconLink) {
        touchIconLink?.remove();
      }
      document.title = originalDocumentTitle;
    };
  }, []);

  // Rótulo em português (com artigo certo) do relacionamento escolhido
  // pelo Responsável em Configurações — "o Pai", "a Mãe", "o Responsável"
  // como fallback até ele escolher. Ver lib/relationship.ts.
  const relationshipInfo = getRelationshipInfo(parentRelationship);

  return (
    <div className="child-portal">
      {/* Bolhas decorativas — bem borradas e nos cantos, de propósito: na
          primeira versão elas ficavam quase sólidas atrás do texto (que
          não tinha fundo próprio) e "engoliam" a leitura. Agora são só um
          brilho suave, empurradas pra fora da coluna de conteúdo. */}
      <div aria-hidden="true" className="child-blob" style={{ width: 220, height: 220, left: -90, top: -60, background: 'hsl(45 97% 78%)', animationDelay: '0s' }} />
      <div aria-hidden="true" className="child-blob" style={{ width: 260, height: 260, right: -110, top: 260, background: 'hsl(174 72% 80%)', animationDelay: '2.2s' }} />
      <div aria-hidden="true" className="child-blob" style={{ width: 200, height: 200, left: -80, bottom: -70, background: 'hsl(330 85% 85%)', animationDelay: '4.4s' }} />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center gap-5 p-5 pb-12 text-center">
        {status === 'success' && (
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--card)/.8)] px-3 py-1.5 shadow-sm backdrop-blur">
              <span aria-hidden="true">🔒</span>
              <span className="text-[11px] font-extrabold text-[hsl(var(--muted-foreground))]">local e privado</span>
            </div>
            <div className="flex items-center gap-2">
              {isPushSupported() && (
                <button
                  type="button"
                  onClick={() => { void toggleNotifications(); }}
                  disabled={notificationsBusy}
                  aria-label={notifications ? 'Desativar notificações' : 'Ativar notificações'}
                  data-testid="button-toggle-child-notifications"
                  className="grid size-10 place-items-center rounded-full bg-[hsl(var(--card))] text-[hsl(var(--primary))] shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
                >
                  {notifications ? <Bell size={17} /> : <BellOff size={17} />}
                </button>
              )}
              <ThemeSwitcher />
            </div>
          </div>
        )}
        {notificationsError && (
          <p className="w-full text-right text-xs font-semibold text-[hsl(var(--destructive))]">{notificationsError}</p>
        )}

        {status === 'checking' && (
          <div className="mt-16 flex flex-col items-center gap-3">
            <span className="animate-bob text-6xl" aria-hidden="true">🎈</span>
            <p className="font-kid text-lg font-bold text-[hsl(var(--foreground))]">Confirmando vínculo com o Responsável…</p>
          </div>
        )}

        {status === 'no_token' && (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-[28px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 shadow-card">
            <span className="text-5xl" aria-hidden="true">🧩</span>
            <h1 className="font-kid text-xl font-extrabold">Link incompleto</h1>
            <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Este link não tem um código de pareamento válido. Peça para o Responsável gerar um
              novo QR code.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="mt-10 flex flex-col items-center gap-3 rounded-[28px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 shadow-card">
            <span className="text-5xl" aria-hidden="true">😅</span>
            <h1 className="font-kid text-xl font-extrabold">Não foi possível vincular</h1>
            <p className="text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              O código pode ter expirado (válido por 15 minutos) ou já foi usado. Peça para o
              Responsável gerar um novo QR code.
            </p>
            {errorMessage && (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Detalhe técnico: {errorMessage}</p>
            )}
          </div>
        )}

        {status === 'success' && (
          <>
            <div className="mt-2 flex flex-col items-center gap-3">
              <div
                className="grid size-20 animate-wiggle place-items-center rounded-full text-4xl font-extrabold text-white shadow-lg"
                style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))' }}
                aria-hidden="true"
              >
                {(childName ?? '?').trim().slice(0, 1).toUpperCase()}
              </div>
              <h1 className="font-kid text-2xl font-extrabold text-[hsl(var(--foreground))]" style={{ textShadow: '0 2px 18px hsl(var(--background) / .55)' }}>
                Oi, {childName ?? 'tudo certo'}! <span aria-hidden="true">👋</span>
              </h1>
              <p className="max-w-xs text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                Seu aparelho já está vinculado{parentName ? <> a <strong className="font-extrabold text-[hsl(var(--foreground))]">{parentName}</strong></> : <> {relationshipInfo.article === 'o' ? 'ao' : 'à'} {relationshipInfo.label}</>}. Você já pode conversar e compartilhar
                sua localização por aqui. <span aria-hidden="true">✨</span>
              </p>
            </div>

            {screenLock?.locked ? (
              <div
                className="mt-2 w-full animate-pop-in rounded-[28px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-7 text-center shadow-card"
                data-testid="panel-screen-time-locked"
              >
                <Hourglass className="mx-auto text-[hsl(var(--primary))]" size={34} />
                <h2 className="font-kid mt-3 text-lg font-extrabold">
                  {screenLock.lockReason === 'manual' ? `${relationshipInfo.article === 'o' ? 'Seu' : 'Sua'} ${relationshipInfo.label} bloqueou o app por enquanto` : 'Seu tempo de uso de hoje acabou'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                  {screenLock.lockReason === 'manual'
                    ? `Fale com ${relationshipInfo.article === 'o' ? 'ele' : 'ela'} se precisar usar o chat agora.`
                    : `Volte amanhã, ou peça ${relationshipInfo.article === 'a' ? 'pra' : 'pro'} ${relationshipInfo.label} liberar mais tempo hoje.`}
                </p>
              </div>
            ) : (
              <div className="w-full animate-pop-in rounded-[28px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 text-left shadow-card">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-[hsl(var(--secondary))]" />
                  <h2 className="font-kid text-base font-extrabold">Conversa com {relationshipInfo.article === 'o' ? 'o' : 'a'} {relationshipInfo.label}</h2>
                </div>
                <p className="mt-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  Só vocês dois veem essa conversa.
                </p>
                <div className="mt-3 flex max-h-72 min-h-[130px] flex-col gap-2 overflow-y-auto rounded-2xl bg-[hsl(var(--muted)/.6)] p-3">
                  {privateLoading && privateMessages.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">Carregando conversa…</p>
                  ) : privateMessages.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">Nenhuma mensagem ainda. Diga oi! <span aria-hidden="true">👋</span></p>
                  ) : (
                    privateMessages.map((message) => {
                      const fromMe = childId !== null && message.senderId === childId;
                      const sticker = isStickerMessage(message);
                      const bubbleClass = sticker
                        ? `${fromMe ? 'self-end' : 'self-start'}`
                        : `rounded-[20px] px-3.5 py-2.5 shadow-sm ${fromMe ? 'self-end text-white' : 'self-start bg-[hsl(var(--card))]'}`;
                      return (
                        <div
                          key={message.id}
                          className={`max-w-[85%] animate-pop-in text-sm leading-6 ${bubbleClass}`}
                          style={sticker || !fromMe ? undefined : { background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))' }}
                        >
                          <MessageContent message={message} authHeaders={{ 'X-Child-Token': deviceToken ?? '' }} />
                        </div>
                      );
                    })
                  )}
                </div>
                {privateError && <p className="mt-2 text-sm font-semibold text-[hsl(var(--destructive))]">{privateError}</p>}
                {attachError && <p className="mt-2 text-sm font-semibold text-[hsl(var(--destructive))]">{attachError}</p>}
                {pendingFile && (
                  <div className="mt-2 flex items-center gap-2 rounded-full bg-[hsl(var(--muted))] px-3.5 py-2 text-xs font-bold">
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
                <form onSubmit={sendPrivate} className="mt-3 flex items-center gap-1.5">
                  <EmojiPicker onSelect={(emoji) => setPrivateDraft((current) => current + emoji)} />
                  <AttachmentPicker
                    onSelect={(file) => {
                      setAttachError(null);
                      setPendingFile(file);
                    }}
                    onError={setAttachError}
                  />
                  <StickerPicker onSelect={(emoji) => { void sendSticker(emoji); }} />
                  <AudioRecorderButton
                    onRecorded={(file) => { void sendAudio(file); }}
                    onError={setAttachError}
                    disabled={privateSending}
                  />
                  <input
                    value={privateDraft}
                    onChange={(event) => setPrivateDraft(event.target.value)}
                    placeholder={pendingFile ? 'Legenda (opcional)…' : 'Escreva uma mensagem…'}
                    className="h-11 flex-1 rounded-full border border-[hsl(var(--border))] bg-transparent px-4 text-sm outline-none focus:border-[hsl(var(--primary))]"
                  />
                  <button
                    type="submit"
                    disabled={(!privateDraft.trim() && !pendingFile) || privateSending}
                    aria-label="Enviar mensagem"
                    data-testid="button-send-private-message"
                    className="grid size-11 shrink-0 place-items-center rounded-full text-white shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))' }}
                  >
                    {privateSending ? '…' : <Send size={17} />}
                  </button>
                </form>
              </div>
            )}

            <div className="w-full animate-pop-in rounded-[28px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-5 text-left shadow-card">
              <div className="flex items-center gap-2">
                <MapPin size={18} className="text-[hsl(var(--accent))]" />
                <h2 className="font-kid text-base font-extrabold">Localização</h2>
              </div>
              <p className="mt-1 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                Fica ligada automaticamente enquanto este app estiver aberto — o Responsável sempre
                vê onde você está agora, sem você precisar tocar em nada.
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-full bg-[hsl(var(--muted)/.6)] px-3.5 py-2 text-sm font-bold">
                <span
                  className={`size-2.5 rounded-full ${locationStatus === 'active' ? 'animate-pulse-soft bg-green-500' : locationStatus === 'error' ? 'bg-red-500' : 'bg-[hsl(var(--muted-foreground))]'}`}
                />
                {locationStatus === 'active' && (
                  <span className="text-green-700">
                    Localização ativa{lastSharedAt ? ` · atualizada ${lastSharedAt.toLocaleTimeString('pt-BR')}` : ''}
                  </span>
                )}
                {locationStatus === 'idle' && <span className="text-[hsl(var(--muted-foreground))]">Ativando…</span>}
                {locationStatus === 'error' && <span className="text-[hsl(var(--destructive))]">{locationError}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PairingJoin;
