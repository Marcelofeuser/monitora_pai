// Cliente para dados reais do Responsável: filhos vinculados, contatos
// aprovados e mensagens espelhadas. Usa token Bearer pelo mesmo motivo
// de pairing-api.ts (PWA e api-server em domínios diferentes no Railway).
const API_URL = import.meta.env.VITE_API_URL ?? '';

function authHeaders(token: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type ChildUser = {
  id: string;
  name: string;
};

export async function fetchChildren(authToken: string | null): Promise<ChildUser[]> {
  const res = await fetch(`${API_URL}/api/children`, { headers: authHeaders(authToken) });
  if (!res.ok) throw new Error(`fetch_children_failed_${res.status}`);
  return res.json();
}

export type ApprovedContact = {
  id: string;
  contactName: string;
  status: string;
};

export async function fetchApprovedContacts(
  childId: string,
  authToken: string | null,
): Promise<ApprovedContact[]> {
  const res = await fetch(
    `${API_URL}/api/contacts?childId=${encodeURIComponent(childId)}&status=approved`,
    { headers: authHeaders(authToken) },
  );
  if (!res.ok) throw new Error(`fetch_contacts_failed_${res.status}`);
  return res.json();
}

export type MirroredMessage = {
  message: {
    id: string;
    type: string;
    textContent: string | null;
    contentUrl: string | null;
    createdAt: string;
  };
  mirroredAt: string;
};

export async function fetchMirroredMessages(authToken: string | null): Promise<MirroredMessage[]> {
  const res = await fetch(`${API_URL}/api/messages/mirrored`, { headers: authHeaders(authToken) });
  if (!res.ok) throw new Error(`fetch_mirrored_failed_${res.status}`);
  return res.json();
}
