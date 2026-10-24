const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

export type PairingResult = {
  token: string;
  pairingCode: string;
  joinUrl: string;
  expiresAt: string;
};

export type ConfirmPairingResult = {
  childUserId: string;
  parentId: string;
  childName: string;
  deviceToken: string;
};

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
