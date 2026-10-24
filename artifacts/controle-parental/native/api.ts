const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

export type PairingResult = {
  token: string;
  pairingCode: string;
  joinUrl: string;
  expiresAt: string;
  childName?: string;
};

export type ConfirmPairingResult = {
  childUserId: string;
  parentId: string;
  childName: string;
  deviceToken: string;
};

export type PrivateMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  textContent: string | null;
  contentUrl: string | null;
  createdAt: string;
};

export type ChildProfile = { id: string; name: string };

function apiUrl(path: string): string {
  if (!API_URL) {
    throw new Error('Configure EXPO_PUBLIC_API_URL no arquivo .env do app.');
  }
  return `${API_URL}${path}`;
}

async function readError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('Retry-After'));
    const minutes = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.ceil(retryAfter / 60)
      : 15;
    return new Error(`Muitas tentativas. Aguarde ${minutes} minuto(s) e tente novamente.`);
  }
  return new Error(body.error ?? `A API respondeu com erro ${response.status}.`);
}

export async function createChildPairing(
  input: { childName: string; childAge?: string; consent: true },
  authToken: string,
): Promise<PairingResult> {
  const response = await fetch(apiUrl('/api/pairing'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function createChildReconnectPairing(childId: string, authToken: string): Promise<PairingResult> {
  const response = await fetch(apiUrl('/api/pairing/reconnect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ childId }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function confirmChildPairing(token: string): Promise<ConfirmPairingResult> {
  const response = await fetch(apiUrl('/api/pairing/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function confirmChildPairingCode(code: string): Promise<ConfirmPairingResult> {
  const response = await fetch(apiUrl('/api/pairing/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchParentChildren(authToken: string): Promise<ChildProfile[]> {
  const response = await fetch(apiUrl('/api/children'), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchParentPrivateMessages(childId: string, authToken: string): Promise<PrivateMessage[]> {
  const response = await fetch(`${apiUrl('/api/conversations/private')}?childId=${encodeURIComponent(childId)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  const result = await response.json();
  return result.messages;
}

export async function sendParentPrivateMessage(childId: string, textContent: string, authToken: string): Promise<PrivateMessage> {
  const response = await fetch(apiUrl('/api/conversations/private/messages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ childId, textContent }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchChildPrivateMessages(deviceToken: string): Promise<{
  messages: PrivateMessage[];
  parentName: string | null;
}> {
  const response = await fetch(apiUrl('/api/child/conversations/private'), {
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function sendChildPrivateMessage(deviceToken: string, textContent: string): Promise<PrivateMessage> {
  const response = await fetch(apiUrl('/api/child/conversations/private/messages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Child-Token': deviceToken },
    body: JSON.stringify({ textContent }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function revokeChildDevice(deviceToken: string): Promise<void> {
  const response = await fetch(apiUrl('/api/child/device/revoke'), {
    method: 'POST',
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!response.ok) throw await readError(response);
}

export function pairingTokenFromQr(data: string): string | null {
  try {
    const url = new URL(data);
    return url.searchParams.get('token');
  } catch {
    const embeddedToken = data.match(/[?&]token=([A-Za-z0-9_-]{24,256})/);
    if (embeddedToken) return embeddedToken[1];
    const token = data.trim();
    return /^[A-Za-z0-9_-]{24,256}$/.test(token) ? token : null;
  }
}
