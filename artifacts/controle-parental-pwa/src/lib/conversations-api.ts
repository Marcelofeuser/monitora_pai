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

export async function sendPrivateMessage(
  childId: string,
  textContent: string,
  authToken: string | null,
): Promise<PrivateMessage> {
  const res = await fetch(`${API_URL}/api/conversations/private/messages`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ childId, textContent }),
  });
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
