import { useEffect, useRef, useState } from 'react';
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
import { Hourglass, Bell, BellOff, Sparkles, Send, MapPin, Plus, Maximize2, Minimize2 } from 'lucide-react';

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

// Faz o campo de texto crescer sozinho conforme a Criança digita (até um
// limite, depois rola por dentro) — antes era um <input> de uma linha só,
// que cortava o texto e, junto com os 4 botões de anexo ao lado, estourava
// a largura da tela em aparelhos menores (pedido do Marcelo).
const COMPOSER_MAX_HEIGHT = 128;
function autoGrowTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
}

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
  const [composerToolsOpen, setComposerToolsOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
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

  // Dá ao PWA da Criança uma identidade própria (nome "Ampara Kids" e o
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
    titleMeta.setAttribute('content', 'Ampara Kids');

    let touchIconLink = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const hadTouchIconLink = Boolean(touchIconLink);
    const originalTouchIconHref = touchIconLink?.getAttribute('href') ?? null;
    if (!touchIconLink) {
      touchIconLink = document.createElement('link');
      touchIconLink.setAttribute('rel', 'apple-touch-icon');
      document.head.appendChild(touchIconLink);
    }
    touchIconLink.setAttribute('href', `${base}apple-touch-icon-child.png`);

    let themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const hadThemeColorMeta = Boolean(themeColorMeta);
    const originalThemeColorContent = themeColorMeta?.getAttribute('content') ?? null;
    if (!themeColorMeta) {
      themeColorMeta = document.createElement('meta');
      themeColorMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.setAttribute('content', '#8DD217');

    const originalDocumentTitle = document.title;
    document.title = 'Ampara Kids';

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
      if (hadThemeColorMeta && originalThemeColorContent !== null) {
        themeColorMeta?.setAttribute('content', originalThemeColorContent);
      } else if (!hadThemeColorMeta) {
        themeColorMeta?.remove();
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

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center gap-2 p-3 pb-2 text-center">
        {status === 'success' && (
          <div className="flex w-full shrink-0 items-center justify-between gap-2">
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
          <p className="w-full shrink-0 text-right text-xs font-semibold text-[hsl(var(--destructive))]">{notificationsError}</p>
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
            <div className="mt-1 flex w-full shrink-0 items-center gap-3 text-left">
              <div
                className="grid size-12 shrink-0 animate-wiggle place-items-center rounded-full text-xl font-extrabold text-white shadow-lg"
                style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))' }}
                aria-hidden="true"
              >
                {(childName ?? '?').trim().slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="font-kid truncate text-lg font-extrabold text-[hsl(var(--foreground))]" style={{ textShadow: '0 2px 18px hsl(var(--background) / .55)' }}>
                  Oi, {childName ?? 'tudo certo'}! <span aria-hidden="true">👋</span>
                </h1>
                <p className="truncate text-xs leading-5 text-[hsl(var(--muted-foreground))]">
                  vinculado{parentName ? <> a <strong className="font-extrabold text-[hsl(var(--foreground))]">{parentName}</strong></> : <> {relationshipInfo.article === 'o' ? 'ao' : 'à'} {relationshipInfo.label}</>}
                </p>
              </div>
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
              <div
                className={
                  chatExpanded
                    ? 'fixed inset-0 z-40 flex animate-pop-in flex-col bg-[hsl(var(--card))] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-left'
                    : 'flex w-full min-h-0 flex-1 animate-pop-in flex-col rounded-[28px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-3 text-left shadow-card'
                }
                data-testid="panel-private-chat"
              >
                <div className="flex shrink-0 items-center gap-2">
                  <Sparkles size={18} className="shrink-0 text-[hsl(var(--secondary))]" />
                  <h2 className="font-kid min-w-0 flex-1 truncate text-base font-extrabold">{parentName ? `${parentName} (${relationshipInfo.label})` : relationshipInfo.label}</h2>
                  <button
                    type="button"
                    onClick={() => setChatExpanded((current) => !current)}
                    aria-label={chatExpanded ? 'Reduzir conversa' : 'Expandir conversa pra tela toda'}
                    title={chatExpanded ? 'Reduzir conversa' : 'Expandir conversa pra tela toda'}
                    data-testid="button-toggle-chat-fullscreen"
                    className="grid size-8 shrink-0 place-items-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
                  >
                    {chatExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                </div>
                <p className="mt-1 shrink-0 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                  Só vocês dois veem essa conversa.
                </p>
                <div className="mt-3 flex min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto rounded-2xl bg-[hsl(var(--muted)/.6)] p-3">
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
                {privateError && <p className="mt-2 shrink-0 text-sm font-semibold text-[hsl(var(--destructive))]">{privateError}</p>}
                {attachError && <p className="mt-2 shrink-0 text-sm font-semibold text-[hsl(var(--destructive))]">{attachError}</p>}
                {pendingFile && (
                  <div className="mt-2 flex shrink-0 items-center gap-2 rounded-full bg-[hsl(var(--muted))] px-3.5 py-2 text-xs font-bold">
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
                <form onSubmit={sendPrivate} className="mt-2 flex shrink-0 items-end gap-1.5">
                  {/* Antes eram 4 botões soltos (emoji/anexo/figurinha/áudio) ao
                      lado do campo de escrever — em telas menores isso
                      estourava a largura e empurrava o botão de enviar pra
                      fora da tela. Agora ficam escondidos atrás de um único
                      botão "+" que abre um menu em cascata por cima. */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setComposerToolsOpen((current) => !current)}
                      aria-label={composerToolsOpen ? 'Fechar opções' : 'Mais opções (emoji, foto, figurinha, áudio)'}
                      data-testid="button-composer-tools"
                      className={`grid size-11 shrink-0 place-items-center rounded-full border transition-transform ${
                        composerToolsOpen
                          ? 'rotate-45 border-[hsl(var(--primary))] text-[hsl(var(--primary))]'
                          : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
                      }`}
                    >
                      <Plus size={20} />
                    </button>
                    {composerToolsOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setComposerToolsOpen(false)} />
                        <div
                          className="absolute bottom-full left-0 z-40 mb-2 flex flex-col gap-1.5 rounded-2xl border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-1.5 shadow-lg"
                          data-testid="panel-composer-tools"
                        >
                          <EmojiPicker
                            onSelect={(emoji) => {
                              setPrivateDraft((current) => current + emoji);
                              setComposerToolsOpen(false);
                            }}
                          />
                          <AttachmentPicker
                            onSelect={(file) => {
                              setAttachError(null);
                              setPendingFile(file);
                              setComposerToolsOpen(false);
                            }}
                            onError={setAttachError}
                          />
                          <StickerPicker
                            onSelect={(emoji) => {
                              void sendSticker(emoji);
                              setComposerToolsOpen(false);
                            }}
                          />
                          <AudioRecorderButton
                            onRecorded={(file) => {
                              void sendAudio(file);
                              setComposerToolsOpen(false);
                            }}
                            onError={setAttachError}
                            disabled={privateSending}
                          />
                        </div>
                      </>
                    )}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={privateDraft}
                    onChange={(event) => {
                      setPrivateDraft(event.target.value);
                      autoGrowTextarea(event.target);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={pendingFile ? 'Legenda (opcional)…' : 'Escreva uma mensagem…'}
                    rows={1}
                    className="max-h-32 min-h-[44px] flex-1 resize-none rounded-3xl border border-[hsl(var(--border))] bg-transparent px-4 py-2.5 text-sm leading-5 outline-none focus:border-[hsl(var(--primary))]"
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

            {/* Barra fina — antes era um card grande, mas com o chat ocupando o
                resto da tela (pedido do Marcelo) não sobrava espaço. O texto
                explicativo virou o `title` (tooltip ao segurar/passar o dedo). */}
            <div
              className="mt-1 flex w-full shrink-0 items-center gap-2 rounded-full border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] px-4 py-2 text-xs font-bold shadow-card"
              title="Localização fica ligada automaticamente enquanto este app estiver aberto."
            >
              <MapPin size={14} className="shrink-0 text-[hsl(var(--accent))]" />
              <span
                className={`size-2 shrink-0 rounded-full ${locationStatus === 'active' ? 'animate-pulse-soft bg-green-500' : locationStatus === 'error' ? 'bg-red-500' : 'bg-[hsl(var(--muted-foreground))]'}`}
              />
              {locationStatus === 'active' && (
                <span className="truncate text-green-700">
                  Localização ativa{lastSharedAt ? ` · ${lastSharedAt.toLocaleTimeString('pt-BR')}` : ''}
                </span>
              )}
              {locationStatus === 'idle' && <span className="truncate text-[hsl(var(--muted-foreground))]">Ativando localização…</span>}
              {locationStatus === 'error' && <span className="truncate text-[hsl(var(--destructive))]">{locationError}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default PairingJoin;
