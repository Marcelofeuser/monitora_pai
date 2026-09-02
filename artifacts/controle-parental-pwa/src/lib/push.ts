// Assinatura de push do navegador (Web Push API) — usada pelo toggle
// "Notificações" em Configurações. A chave pública VAPID é a mesma que o
// backend usa pra assinar (VAPID_PUBLIC_KEY no api-server / aqui como
// VITE_VAPID_PUBLIC_KEY), só que em Base64URL — o navegador espera um
// Uint8Array, daí o decode abaixo.
const API_URL = import.meta.env.VITE_API_URL ?? '';
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  // new Uint8Array(length) (ao invés de Uint8Array.from) garante o tipo
  // Uint8Array<ArrayBuffer> exigido por applicationServerKey — from()
  // retorna Uint8Array<ArrayBufferLike>, que o TS mais novo não aceita ali.
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && Boolean(VAPID_PUBLIC_KEY);
}

function subscriptionToPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } };
}

// Quem está assinando: o Responsável (Bearer do Clerk) ou a Criança
// (X-Child-Token, ela não tem conta Clerk) — decide tanto o endpoint quanto
// o header de autenticação usado pra guardar a assinatura no backend (ver
// routes/notifications.ts). Generalizado nesta rodada porque antes só o
// Responsável podia ativar notificação; agora a Criança também pode.
export type PushIdentity = { kind: 'parent'; authToken: string | null } | { kind: 'child'; deviceToken: string };

function pushHeaders(identity: PushIdentity): HeadersInit {
  if (identity.kind === 'parent') {
    return {
      'Content-Type': 'application/json',
      ...(identity.authToken ? { Authorization: `Bearer ${identity.authToken}` } : {}),
    };
  }
  return { 'Content-Type': 'application/json', 'X-Child-Token': identity.deviceToken };
}

function pushEndpoint(identity: PushIdentity, action: 'subscribe' | 'unsubscribe'): string {
  const base = identity.kind === 'parent' ? '/api/notifications' : '/api/child/notifications';
  return `${API_URL}${base}/${action}`;
}

// Pede permissão de notificação (se ainda não decidida), assina o push no
// navegador e manda a assinatura pro backend guardar. Lança erro se o
// usuário negar a permissão ou se o navegador não suportar — quem chama
// decide como mostrar isso.
export async function enablePushNotifications(identity: PushIdentity): Promise<void> {
  if (!isPushSupported()) throw new Error('push_not_supported');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('permission_denied');

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
    }));

  const res = await fetch(pushEndpoint(identity, 'subscribe'), {
    method: 'POST',
    headers: pushHeaders(identity),
    body: JSON.stringify(subscriptionToPayload(subscription)),
  });
  if (!res.ok) throw new Error(`subscribe_failed_${res.status}`);
}

export async function disablePushNotifications(identity: PushIdentity): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const payload = subscriptionToPayload(subscription);
  await subscription.unsubscribe();

  await fetch(pushEndpoint(identity, 'unsubscribe'), {
    method: 'POST',
    headers: pushHeaders(identity),
    body: JSON.stringify({ endpoint: payload.endpoint }),
  }).catch(() => undefined);
}
