// Ponte de push NATIVO pro app iOS "Amparo" (Responsável) — o WKWebView do
// app nativo não tem acesso à Web Push API do navegador (a Apple só libera
// isso pra PWA instalado via Safari com "Adicionar à Tela de Início"), então
// o Xcode injeta um canal próprio via `window.webkit.messageHandlers` (ver
// PushNotifications.swift / WebView.swift no projeto Xcode) que a gente usa
// aqui em vez do Push API padrão (lib/push.ts, que continua sendo usado
// normalmente no Android/desktop, onde a Web Push API real existe).
const API_URL = import.meta.env.VITE_API_URL ?? '';

type WebkitMessageHandlers = {
  'push-permission-request'?: { postMessage: (body: string) => void };
  'push-token'?: { postMessage: (body: string) => void };
};

function getMessageHandlers(): WebkitMessageHandlers | undefined {
  return (window as unknown as { webkit?: { messageHandlers?: WebkitMessageHandlers } }).webkit?.messageHandlers;
}

export function isNativeIOSBridgeAvailable(): boolean {
  const handlers = getMessageHandlers();
  return Boolean(handlers?.['push-permission-request'] && handlers?.['push-token']);
}

function requestNativePermission(): Promise<boolean> {
  return new Promise((resolve) => {
    const handlers = getMessageHandlers();
    if (!handlers?.['push-permission-request']) {
      resolve(false);
      return;
    }
    const listener = (event: Event) => {
      window.removeEventListener('push-permission-request', listener);
      const detail = (event as CustomEvent<string>).detail;
      resolve(detail === 'granted');
    };
    window.addEventListener('push-permission-request', listener);
    handlers['push-permission-request'].postMessage('');
  });
}

function requestNativeFcmToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const handlers = getMessageHandlers();
    if (!handlers?.['push-token']) {
      resolve(null);
      return;
    }
    const listener = (event: Event) => {
      window.removeEventListener('push-token', listener);
      const detail = (event as CustomEvent<string>).detail;
      resolve(detail && detail !== 'ERROR GET TOKEN' ? detail : null);
    };
    window.addEventListener('push-token', listener);
    handlers['push-token'].postMessage('');
  });
}

function authHeaders(authToken: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
}

// Pede permissão nativa (mostra o popup do iOS na primeira vez), busca o
// token do Firebase Messaging pela ponte, e registra ele no backend — se
// qualquer etapa falhar, lança erro (mesmo formato de push.ts) pra quem
// chamar decidir como mostrar.
export async function enableNativeIOSPush(authToken: string | null): Promise<void> {
  if (!isNativeIOSBridgeAvailable()) throw new Error('native_bridge_not_available');

  const granted = await requestNativePermission();
  if (!granted) throw new Error('permission_denied');

  const token = await requestNativeFcmToken();
  if (!token) throw new Error('token_unavailable');

  const res = await fetch(`${API_URL}/api/notifications/register-fcm-token`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error(`register_fcm_token_failed_${res.status}`);
}

// Não existe um jeito de "desligar" a permissão do iOS por JS (só nas
// Configurações do próprio aparelho) — aqui a gente só para de mandar
// removendo o token do backend.
export async function disableNativeIOSPush(authToken: string | null): Promise<void> {
  if (!isNativeIOSBridgeAvailable()) return;
  const token = await requestNativeFcmToken();
  if (!token) return;

  await fetch(`${API_URL}/api/notifications/unregister-fcm-token`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ token }),
  }).catch(() => undefined);
}
