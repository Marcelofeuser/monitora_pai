// Conversa Criança <-> Contato aprovado (mãe, avó, tia...). Duas pontas,
// cada uma com seu próprio token de dispositivo -- mesmo padrão de
// child-conversations-api.ts:
//   - lado da Criança: X-Child-Token (já existente), rotas /api/child/...
//   - lado do Contato: X-Contact-Token (novo), rotas /api/contact/...
const API_URL = import.meta.env.VITE_API_URL ?? '';

export type PrivateMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: string;
  textContent: string | null;
  contentUrl: string | null;
  createdAt: string;
};

export type SendMessageInput =
  | { textContent: string }
  | { file: File; caption?: string }
  | { stickerEmoji: string };

// ---------------------------------------------------------------------
// Lado do Contato (mãe/avó/tia): uma única conversa, com a Criança do
// convite que ela aceitou -- por isso nenhuma função aqui pede childId.
// ---------------------------------------------------------------------

export type ContactConversation = {
  conversation: { id: string; participantAId: string; participantBId: string };
  messages: PrivateMessage[];
  childName: string | null;
};

export async function fetchContactConversation(deviceToken: string): Promise<ContactConversation> {
  const res = await fetch(`${API_URL}/api/contact/conversations/with-child`, {
    headers: { 'X-Contact-Token': deviceToken },
  });
  if (!res.ok) throw new Error(`fetch_contact_conversation_failed_${res.status}`);
  return res.json();
}

export async function sendContactMessage(deviceToken: string, input: SendMessageInput): Promise<PrivateMessage> {
  return sendDeviceMessage('/api/contact/conversations/with-child/messages', 'X-Contact-Token', deviceToken, input);
}

// ---------------------------------------------------------------------
// Lado da Criança: lista de Contatos aprovados que já aceitaram o
// convite (têm contactUserId) + conversa com cada um.
// ---------------------------------------------------------------------

export type ChildContact = {
  id: string;
  contactUserId: string;
  contactName: string;
};

export async function fetchChildContacts(deviceToken: string): Promise<ChildContact[]> {
  const res = await fetch(`${API_URL}/api/child/contacts`, {
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!res.ok) throw new Error(`fetch_child_contacts_failed_${res.status}`);
  return res.json();
}

export type ChildContactConversation = {
  conversation: { id: string; participantAId: string; participantBId: string };
  messages: PrivateMessage[];
  contactName: string;
};

export async function fetchChildContactConversation(
  deviceToken: string,
  contactUserId: string,
): Promise<ChildContactConversation> {
  const res = await fetch(`${API_URL}/api/child/conversations/contact/${encodeURIComponent(contactUserId)}`, {
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!res.ok) throw new Error(`fetch_child_contact_conversation_failed_${res.status}`);
  return res.json();
}

export async function sendChildContactMessage(
  deviceToken: string,
  contactUserId: string,
  input: SendMessageInput,
): Promise<PrivateMessage> {
  return sendDeviceMessage(
    `/api/child/conversations/contact/${encodeURIComponent(contactUserId)}/messages`,
    'X-Child-Token',
    deviceToken,
    input,
  );
}

// Helper compartilhado: mesma lógica de texto/anexo/figurinha usada em
// child-conversations-api.ts, só que parametrizada pelo header e pela URL
// (evita duplicar 3x o mesmo if/else de FormData vs JSON).
async function sendDeviceMessage(
  path: string,
  headerName: 'X-Child-Token' | 'X-Contact-Token',
  deviceToken: string,
  input: SendMessageInput,
): Promise<PrivateMessage> {
  let res: Response;
  if ('file' in input) {
    const form = new FormData();
    form.append('file', input.file);
    if (input.caption) form.append('textContent', input.caption);
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { [headerName]: deviceToken }, body: form });
  } else if ('stickerEmoji' in input) {
    const form = new FormData();
    form.append('stickerEmoji', input.stickerEmoji);
    res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { [headerName]: deviceToken }, body: form });
  } else {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [headerName]: deviceToken },
      body: JSON.stringify({ textContent: input.textContent }),
    });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `send_message_failed_${res.status}`);
  }
  return res.json();
}
