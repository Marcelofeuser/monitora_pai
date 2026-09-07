// Item 13 do pedido: multiplos Responsaveis pela mesma Crianca. Mesmo
// espirito de contact-invite-api.ts -- as funcoes de convite (info/accept)
// sao usadas por quem ainda pode nao ter conta nenhuma no momento em que
// abre o link, mas accept exige um token do Clerk (ver GuardianJoin.tsx).
// Mesmo padrao de auth Bearer que me-api.ts/pairing-api.ts.
const API_URL = import.meta.env.VITE_API_URL ?? '';

function authHeaders(token?: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type GuardianInfo = { id: string; name: string; role: 'owner' | 'guardian' };

export async function fetchGuardians(authToken: string | null): Promise<GuardianInfo[]> {
  const res = await fetch(`${API_URL}/api/guardians`, { headers: authHeaders(authToken) });
  if (!res.ok) throw new Error(`fetch_guardians_failed_${res.status}`);
  return res.json();
}

export type GuardianInviteResult = { token: string; joinUrl: string; expiresAt: string };

export async function createGuardianInvite(authToken: string | null): Promise<GuardianInviteResult> {
  const res = await fetch(`${API_URL}/api/guardians/invite`, {
    method: 'POST',
    headers: authHeaders(authToken),
  });
  if (!res.ok) throw new Error(`create_guardian_invite_failed_${res.status}`);
  return res.json();
}

export async function removeGuardian(parentId: string, authToken: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/api/guardians/${encodeURIComponent(parentId)}`, {
    method: 'DELETE',
    headers: authHeaders(authToken),
  });
  if (!res.ok) throw new Error(`remove_guardian_failed_${res.status}`);
}

export type GuardianInviteInfo = { invitedByName: string | null; expiresAt: string };

// Publica -- sem token do Clerk, quem abre o link pode ainda nao ter conta.
export async function getGuardianInviteInfo(token: string): Promise<GuardianInviteInfo> {
  const res = await fetch(`${API_URL}/api/guardians/invite/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `fetch_guardian_invite_failed_${res.status}`);
  }
  return res.json();
}

export type AcceptGuardianInviteResult = { ok: true; childrenCount: number };

// Autenticada -- so chamar depois que quem aceita ja tem sessao Clerk
// ativa (ver GuardianJoin.tsx).
export async function acceptGuardianInvite(
  token: string,
  authToken: string | null,
): Promise<AcceptGuardianInviteResult> {
  const res = await fetch(`${API_URL}/api/guardians/invite/${encodeURIComponent(token)}/accept`, {
    method: 'POST',
    headers: authHeaders(authToken),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `accept_guardian_invite_failed_${res.status}`);
  }
  return res.json();
}
