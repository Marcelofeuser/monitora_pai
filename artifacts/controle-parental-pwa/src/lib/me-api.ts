// Cliente para GET/PATCH /api/me — dados do Responsável autenticado,
// incluindo o relacionamento escolhido (pai/mãe/avó/tio/etc, ver
// lib/relationship.ts). Mesmo padrão de auth Bearer que pairing-api.ts.
import type { ParentRelationship } from './relationship';

const API_URL = import.meta.env.VITE_API_URL ?? '';

function authHeaders(token?: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type MeResponse = {
  id: string;
  name: string;
  relationship: ParentRelationship | null;
};

export async function fetchMe(authToken: string | null): Promise<MeResponse> {
  const res = await fetch(`${API_URL}/api/me`, {
    headers: authHeaders(authToken),
  });
  if (!res.ok) throw new Error(`fetch_me_failed_${res.status}`);
  return res.json();
}

export async function updateMyRelationship(
  relationship: ParentRelationship,
  authToken: string | null,
): Promise<MeResponse> {
  const res = await fetch(`${API_URL}/api/me`, {
    method: 'PATCH',
    headers: authHeaders(authToken),
    body: JSON.stringify({ relationship }),
  });
  if (!res.ok) throw new Error(`update_me_failed_${res.status}`);
  return res.json();
}
