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
  photoUrl: string | null;
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

// Ultimo passo do fluxo de criacao ("colocar foto") -- chamado logo depois
// de createGroup, com o id do grupo recem-criado. Tambem usado pelo menu
// de long-press do balao pra trocar a foto depois.
export async function uploadGroupPhoto(groupId: string, file: File, authToken: string | null): Promise<Group> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/api/groups/${encodeURIComponent(groupId)}/photo`, {
    method: 'POST',
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `upload_group_photo_failed_${res.status}`);
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

// Chat de verdade do grupo (pedido do Marcelo) -- texto, foto/video
// (campo "file") ou figurinha, mesmo padrao de SendPrivateMessageInput
// em conversations-api.ts.
export type GroupMessage = {
  id: string;
  groupId: string;
  senderId: string;
  type: string;
  textContent: string | null;
  contentUrl: string | null;
  createdAt: string;
};
export type GroupConversation = { group: Group; messages: GroupMessage[]; participantNames: Record<string, string> };
export type SendGroupMessageInput = { textContent: string } | { file: File; caption?: string } | { stickerEmoji: string };

export async function fetchGroupMessages(groupId: string, authToken: string | null): Promise<GroupConversation> {
  const res = await fetch(`${API_URL}/api/groups/${encodeURIComponent(groupId)}/messages`, { headers: authHeaders(authToken) });
  if (!res.ok) throw new Error(`fetch_group_messages_failed_${res.status}`);
  return res.json();
}

export async function sendGroupMessage(groupId: string, input: SendGroupMessageInput, authToken: string | null): Promise<GroupMessage> {
  const url = `${API_URL}/api/groups/${encodeURIComponent(groupId)}/messages`;
  let res: Response;
  if ('file' in input) {
    const form = new FormData();
    form.append('file', input.file);
    if (input.caption) form.append('textContent', input.caption);
    res = await fetch(url, { method: 'POST', headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, body: form });
  } else if ('stickerEmoji' in input) {
    const form = new FormData();
    form.append('stickerEmoji', input.stickerEmoji);
    res = await fetch(url, { method: 'POST', headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined, body: form });
  } else {
    res = await fetch(url, { method: 'POST', headers: authHeaders(authToken), body: JSON.stringify({ textContent: input.textContent }) });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `send_group_message_failed_${res.status}`);
  }
  return res.json();
}
