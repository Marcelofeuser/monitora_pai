// Canal privado Responsável <-> Criança, lado da Criança — autenticado
// pelo token de dispositivo (X-Child-Token), mesmo padrão de
// location-api.ts (a Criança não tem conta Clerk).
const API_URL = import.meta.env.VITE_API_URL ?? '';

function deviceHeaders(deviceToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Child-Token': deviceToken,
  };
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

export async function fetchChildPrivateConversation(deviceToken: string): Promise<PrivateConversation> {
  const res = await fetch(`${API_URL}/api/child/conversations/private`, {
    headers: deviceHeaders(deviceToken),
  });
  if (!res.ok) throw new Error(`fetch_private_conversation_failed_${res.status}`);
  return res.json();
}

export type SendChildPrivateMessageInput =
  | { textContent: string }
  | { file: File; caption?: string }
  | { stickerEmoji: string };

export async function sendChildPrivateMessage(
  deviceToken: string,
  input: SendChildPrivateMessageInput,
): Promise<PrivateMessage> {
  let res: Response;
  if ('file' in input) {
    const form = new FormData();
    form.append('file', input.file);
    if (input.caption) form.append('textContent', input.caption);
    res = await fetch(`${API_URL}/api/child/conversations/private/messages`, {
      method: 'POST',
      headers: { 'X-Child-Token': deviceToken },
      body: form,
    });
  } else if ('stickerEmoji' in input) {
    const form = new FormData();
    form.append('stickerEmoji', input.stickerEmoji);
    res = await fetch(`${API_URL}/api/child/conversations/private/messages`, {
      method: 'POST',
      headers: { 'X-Child-Token': deviceToken },
      body: form,
    });
  } else {
    res = await fetch(`${API_URL}/api/child/conversations/private/messages`, {
      method: 'POST',
      headers: deviceHeaders(deviceToken),
      body: JSON.stringify({ textContent: input.textContent }),
    });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `send_private_message_failed_${res.status}`);
  }
  return res.json();
}
