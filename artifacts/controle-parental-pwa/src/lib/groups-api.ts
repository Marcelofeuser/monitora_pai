// Cliente pra grupos (item 8) — só o lado do Responsável, mesmo padrão
// Bearer do Clerk de conversations-api.ts. Não existe lado da Criança
// ainda porque o chat de grupo em si depende de contato conseguir se
// autenticar no app (ver comentário em lib/db/src/schema/groups.ts) — por
// enquanto isto é só criação/gestão de quem está autorizado a participar.
const API_URL = import.meta.env.VITE_API_URL ?? '';

function authHeaders(token: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type GroupMember = { id: string; contactName: string };
export type Group = {
  id: string;
  childId: string;
  name: string;
  createdByParentId: string;
  createdAt: string;
  members: GroupMember[];
};

export async function fetchGroups(childId: string, authToken: string | null): Promise<Group[]> {
  const res = await fetch(`${API_URL}/api/groups?childId=${encodeURIComponent(childId)}`, {
    headers: authHeaders(authToken),
  });
  if (!res.ok) throw new Error(`fetch_groups_failed_${res.status}`);
  return res.json();
}

export async function createGroup(
  childId: string,
  name: string,
  contactIds: string[],
  authToken: string | null,
): Promise<Group> {
  const res = await fetch(`${API_URL}/api/groups`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ childId, name, contactIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `create_group_failed_${res.status}`);
  }
  return res.json();
}

export async function deleteGroup(groupId: string, authToken: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/api/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    headers: authHeaders(authToken),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `delete_group_failed_${res.status}`);
  }
}

// Adiciona/remove um contato de um grupo já existente (pedido do Marcelo:
// antes só dava pra escolher os membros na hora de criar o grupo).
export async function addGroupMember(groupId: string, contactId: string, authToken: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/api/groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ contactId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `add_group_member_failed_${res.status}`);
  }
}

export async function removeGroupMember(groupId: string, contactId: string, authToken: string | null): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(contactId)}`,
    { method: 'DELETE', headers: authHeaders(authToken) },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `remove_group_member_failed_${res.status}`);
  }
}
