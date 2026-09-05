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

// Exclusão de verdade da Criança (não é revogar contato) — pedido do
// Marcelo depois de acumular várias crianças duplicadas de repareamentos
// antigos. Irreversível: apaga mensagens, localização, tempo de uso e
// contatos dela junto (cascade no backend, ver routes/contacts.ts).
export async function deleteChild(childId: string, authToken: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/api/children/${encodeURIComponent(childId)}`, {
    method: 'DELETE',
    headers: authHeaders(authToken),
  });
  if (!res.ok) throw new Error(`delete_child_failed_${res.status}`);
}

export type ApprovedContact = {
  id: string;
  contactName: string;
  status: string;
  // Preenchido só depois que o Contato aceita o convite por link/QR (ver
  // inviteContact abaixo e routes/contacts.ts) -- até lá é null, e ele
  // ainda não tem como conversar de verdade com a Criança.
  contactUserId: string | null;
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


export type PrivateMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  textContent: string | null;
  contentUrl: string | null;
  createdAt: string;
};

export type PrivateConversation = {
  conversation: { id: string; participantAId: string; participantBId: string };
  messages: PrivateMessage[];
};

// Canal privado Responsável <-> Criança (lado do Responsável). Sempre
// autenticado com token do Clerk, igual ao resto deste arquivo.
export async function fetchPrivateConversation(
  childId: string,
  authToken: string | null,
): Promise<PrivateConversation> {
  const res = await fetch(
    `${API_URL}/api/conversations/private?childId=${encodeURIComponent(childId)}`,
    { headers: authHeaders(authToken) },
  );
  if (!res.ok) throw new Error(`fetch_private_conversation_failed_${res.status}`);
  return res.json();
}

// A mensagem pode ser texto, uma foto/vídeo anexado (campo "file") ou uma
// figurinha (stickerEmoji) — nunca mais de um ao mesmo tempo. Anexo/
// figurinha viajam como multipart porque texto puro sozinho continua indo
// como JSON (mais leve, e mantém compatível com o formato de sempre).
export type SendPrivateMessageInput =
  | { textContent: string }
  | { file: File; caption?: string }
  | { stickerEmoji: string };

export async function sendPrivateMessage(
  childId: string,
  input: SendPrivateMessageInput,
  authToken: string | null,
): Promise<PrivateMessage> {
  let res: Response;
  if ('file' in input) {
    const form = new FormData();
    form.append('childId', childId);
    form.append('file', input.file);
    if (input.caption) form.append('textContent', input.caption);
    res = await fetch(`${API_URL}/api/conversations/private/messages`, {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      body: form,
    });
  } else if ('stickerEmoji' in input) {
    const form = new FormData();
    form.append('childId', childId);
    form.append('stickerEmoji', input.stickerEmoji);
    res = await fetch(`${API_URL}/api/conversations/private/messages`, {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      body: form,
    });
  } else {
    res = await fetch(`${API_URL}/api/conversations/private/messages`, {
      method: 'POST',
      headers: authHeaders(authToken),
      body: JSON.stringify({ childId, textContent: input.textContent }),
    });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `send_private_message_failed_${res.status}`);
  }
  return res.json();
}


// Só o Responsável adiciona contato — a Criança não tem como chamar essa
// rota (não tem conta Clerk). Nasce direto como "approved": ver o
// comentário em routes/contacts.ts.
export async function addApprovedContact(
  childId: string,
  contactName: string,
  authToken: string | null,
): Promise<ApprovedContact> {
  const res = await fetch(`${API_URL}/api/contacts`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ childId, contactName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `add_contact_failed_${res.status}`);
  }
  return res.json();
}

// Exclui o contato de verdade (some da lista e de qualquer grupo em que
// estivesse) — diferente de "revogar" (que só mudaria o status, mantendo
// a linha). Pedido do Marcelo.
export async function deleteContact(contactId: string, authToken: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/api/contacts/${encodeURIComponent(contactId)}`, {
    method: 'DELETE',
    headers: authHeaders(authToken),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `delete_contact_failed_${res.status}`);
  }
}

export type ContactInvite = {
  token: string;
  joinUrl: string;
  expiresAt: string;
  contactName: string;
};

// Gera o link/QR de convite pra um Contato aprovado virar um usuário de
// verdade e poder conversar com a Criança -- pedido do Marcelo: "a Lorena
// recebe um link com qrcode, ela basta clicar que já faz o pré cadastro
// dela feito". Válido por 7 dias (ver CONTACT_INVITE_TTL_DAYS no backend).
export async function inviteContact(contactId: string, authToken: string | null): Promise<ContactInvite> {
  const res = await fetch(`${API_URL}/api/contacts/${encodeURIComponent(contactId)}/invite`, {
    method: 'POST',
    headers: authHeaders(authToken),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `invite_contact_failed_${res.status}`);
  }
  return res.json();
}
