const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

export type PairingResult = {
  token: string;
  pairingCode: string;
  joinUrl: string;
  expiresAt: string;
  childName?: string;
};

export type ConfirmPairingResult = {
  childUserId: string;
  parentId: string;
  childName: string;
  deviceToken: string;
};

export type PrivateMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  type: string;
  textContent: string | null;
  contentUrl: string | null;
  createdAt: string;
};

export type NativeUploadFile = { uri: string; name: string; type: string };
export type PrivateMessageInput =
  | { textContent: string }
  | { file: NativeUploadFile; caption?: string }
  | { stickerEmoji: string };

export type ChildProfile = { id: string; name: string };
export type GroupProfile = {
  id: string;
  childId: string;
  name: string;
  photoUrl: string | null;
  members: Array<{ id: string; contactName: string }>;
};
export type GroupConversation = {
  messages: PrivateMessage[];
  participantNames: Record<string, string>;
};
export type MirroredContact = { id: string; contactName: string; contactUserId: string | null; status: string };
export type ParentContact = MirroredContact & { contactPhone?: string | null; relation?: string | null; isFavorite?: boolean };
export type ContactInvite = { token: string; joinUrl: string; expiresAt: string; contactName: string };
export type MirroredConversation = { messages: PrivateMessage[]; contactName: string; childName: string };
export type ChildLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
};
export type ScreenTimeStatus = {
  dailyLimitMinutes: number | null;
  minutesUsedToday: number;
  locked: boolean;
  lockReason: 'manual' | 'limit' | null;
};
export type ChildLockStatus = { locked: boolean; lockReason: 'manual' | 'limit' | null };

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

export async function createChildReconnectPairing(childId: string, authToken: string): Promise<PairingResult> {
  const response = await fetch(apiUrl('/api/pairing/reconnect'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ childId }),
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

export async function fetchParentChildren(authToken: string): Promise<ChildProfile[]> {
  const response = await fetch(apiUrl('/api/children'), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchParentApprovedContacts(childId: string, authToken: string): Promise<MirroredContact[]> {
  const response = await fetch(`${apiUrl('/api/contacts')}?childId=${encodeURIComponent(childId)}&status=approved`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchParentContacts(childId: string, authToken: string): Promise<ParentContact[]> {
  const response = await fetch(`${apiUrl('/api/contacts')}?childId=${encodeURIComponent(childId)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function createParentContact(input: { childId: string; contactName: string; contactPhone?: string; relation?: string }, authToken: string): Promise<ParentContact> {
  const response = await fetch(apiUrl('/api/contacts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function setParentContactStatus(contactId: string, decision: 'approved' | 'denied' | 'revoked', authToken: string): Promise<ParentContact> {
  const response = await fetch(apiUrl(`/api/contacts/${encodeURIComponent(contactId)}/decision`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ decision }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function createParentContactInvite(contactId: string, authToken: string): Promise<ContactInvite> {
  const response = await fetch(apiUrl(`/api/contacts/${encodeURIComponent(contactId)}/invite`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchParentScreenTime(childId: string, authToken: string): Promise<ScreenTimeStatus> {
  const response = await fetch(apiUrl(`/api/screen-time/${encodeURIComponent(childId)}`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function setParentDailyLimit(childId: string, dailyLimitMinutes: number | null, authToken: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/screen-time/${encodeURIComponent(childId)}/limit`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ dailyLimitMinutes }),
  });
  if (!response.ok) throw await readError(response);
}

export async function setParentChildLock(childId: string, locked: boolean, authToken: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/screen-time/${encodeURIComponent(childId)}/${locked ? 'lock' : 'unlock'}`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
}

export async function fetchChildScreenTimeStatus(deviceToken: string): Promise<ChildLockStatus> {
  const response = await fetch(apiUrl('/api/child/screen-time/status'), {
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function sendChildScreenTimeHeartbeat(deviceToken: string): Promise<ChildLockStatus> {
  const response = await fetch(apiUrl('/api/child/screen-time/heartbeat'), {
    method: 'POST',
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchParentGroups(childId: string, authToken: string): Promise<GroupProfile[]> {
  const response = await fetch(`${apiUrl('/api/groups')}?childId=${encodeURIComponent(childId)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function createParentGroup(
  childId: string,
  name: string,
  contactIds: string[],
  authToken: string,
): Promise<GroupProfile> {
  const response = await fetch(apiUrl('/api/groups'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ childId, name, contactIds }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

function withGroupSenderNames(result: GroupConversation): GroupConversation {
  return {
    ...result,
    messages: result.messages.map((message) => ({
      ...message,
      senderName: result.participantNames[message.senderId] ?? 'Participante',
    })),
  };
}

export async function fetchParentGroupMessages(groupId: string, authToken: string): Promise<PrivateMessage[]> {
  const response = await fetch(apiUrl(`/api/groups/${encodeURIComponent(groupId)}/messages`), {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  const result = await response.json() as GroupConversation;
  return withGroupSenderNames(result).messages;
}

export async function sendParentGroupMessage(groupId: string, input: PrivateMessageInput, authToken: string): Promise<PrivateMessage> {
  const response = await postMessage(apiUrl(`/api/groups/${encodeURIComponent(groupId)}/messages`), input, { Authorization: `Bearer ${authToken}` });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchParentMirroredConversation(contactUserId: string, authToken: string): Promise<MirroredConversation> {
  const response = await fetch(`${apiUrl(`/api/parent/contacts/${encodeURIComponent(contactUserId)}/messages`)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchParentPrivateMessages(childId: string, authToken: string): Promise<PrivateMessage[]> {
  const response = await fetch(`${apiUrl('/api/conversations/private')}?childId=${encodeURIComponent(childId)}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!response.ok) throw await readError(response);
  const result = await response.json();
  return result.messages;
}

export async function sendParentPrivateMessage(childId: string, input: PrivateMessageInput, authToken: string): Promise<PrivateMessage> {
  if ('file' in input || 'stickerEmoji' in input) {
    const form = new FormData();
    form.append('childId', childId);
    if ('file' in input) {
      form.append('file', input.file as unknown as Blob);
      if (input.caption) form.append('textContent', input.caption);
    } else {
      form.append('stickerEmoji', input.stickerEmoji);
    }
    const response = await fetch(apiUrl('/api/conversations/private/messages'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
    });
    if (!response.ok) throw await readError(response);
    return response.json();
  }

  const response = await fetch(apiUrl('/api/conversations/private/messages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ childId, textContent: input.textContent }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchChildPrivateMessages(deviceToken: string): Promise<{
  messages: PrivateMessage[];
  parentName: string | null;
  parentId: string | null;
}> {
  const response = await fetch(apiUrl('/api/child/conversations/private'), {
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchChildGroups(deviceToken: string): Promise<GroupProfile[]> {
  const response = await fetch(apiUrl('/api/child/groups'), { headers: { 'X-Child-Token': deviceToken } });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function fetchChildGroupMessages(groupId: string, deviceToken: string): Promise<PrivateMessage[]> {
  const response = await fetch(apiUrl(`/api/child/groups/${encodeURIComponent(groupId)}/messages`), {
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!response.ok) throw await readError(response);
  const result = await response.json() as GroupConversation;
  return withGroupSenderNames(result).messages;
}

export async function sendChildGroupMessage(groupId: string, input: PrivateMessageInput, deviceToken: string): Promise<PrivateMessage> {
  const response = await postMessage(apiUrl(`/api/child/groups/${encodeURIComponent(groupId)}/messages`), input, { 'X-Child-Token': deviceToken });
  if (!response.ok) throw await readError(response);
  return response.json();
}

async function postMessage(url: string, input: PrivateMessageInput, authHeaders: Record<string, string>): Promise<Response> {
  if ('file' in input || 'stickerEmoji' in input) {
    const form = new FormData();
    if ('file' in input) {
      form.append('file', input.file as unknown as Blob);
      if (input.caption) form.append('textContent', input.caption);
    } else {
      form.append('stickerEmoji', input.stickerEmoji);
    }
    return fetch(url, { method: 'POST', headers: authHeaders, body: form });
  }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ textContent: input.textContent }),
  });
}

export async function sendChildPrivateMessage(deviceToken: string, input: PrivateMessageInput): Promise<PrivateMessage> {
  if ('file' in input || 'stickerEmoji' in input) {
    const form = new FormData();
    if ('file' in input) {
      form.append('file', input.file as unknown as Blob);
      if (input.caption) form.append('textContent', input.caption);
    } else {
      form.append('stickerEmoji', input.stickerEmoji);
    }
    const response = await fetch(apiUrl('/api/child/conversations/private/messages'), {
      method: 'POST',
      headers: { 'X-Child-Token': deviceToken },
      body: form,
    });
    if (!response.ok) throw await readError(response);
    return response.json();
  }

  const response = await fetch(apiUrl('/api/child/conversations/private/messages'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Child-Token': deviceToken },
    body: JSON.stringify({ textContent: input.textContent }),
  });
  if (!response.ok) throw await readError(response);
  return response.json();
}

export async function revokeChildDevice(deviceToken: string): Promise<void> {
  const response = await fetch(apiUrl('/api/child/device/revoke'), {
    method: 'POST',
    headers: { 'X-Child-Token': deviceToken },
  });
  if (!response.ok) throw await readError(response);
}

export async function reportChildLocation(
  deviceToken: string,
  location: { latitude: number; longitude: number; accuracyMeters?: number },
): Promise<void> {
  const response = await fetch(apiUrl('/api/location'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Child-Token': deviceToken },
    body: JSON.stringify(location),
  });
  if (!response.ok) throw await readError(response);
}

export async function fetchParentChildLocation(
  childId: string,
  authToken: string,
): Promise<ChildLocation | null> {
  const response = await fetch(apiUrl(`/api/location/${encodeURIComponent(childId)}`), {
    headers: { Authorization: `Bearer ${authToken}` },
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
