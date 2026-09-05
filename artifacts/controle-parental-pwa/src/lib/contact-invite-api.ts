// Convite por link/QR pra Contatos adultos (mãe, avó, tia etc.) -- pedido
// do Marcelo: "a Lorena recebe um link com qrcode, ela basta clicar que já
// faz o download do app com o pré cadastro dela feito". Funções PÚBLICAS
// (sem token do Clerk) porque quem abre o link ainda não tem conta -- o
// mesmo espírito de pairing-api.ts, só que pro Contato em vez da Criança.
const API_URL = import.meta.env.VITE_API_URL ?? '';

export type ContactInviteInfo = {
  contactName: string;
  childName: string;
  expiresAt: string;
};

export async function getContactInviteInfo(token: string): Promise<ContactInviteInfo> {
  const res = await fetch(`${API_URL}/api/contacts/invite/${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `fetch_contact_invite_failed_${res.status}`);
  }
  return res.json();
}

export type ConfirmContactInviteResult = {
  contactUserId: string;
  contactName: string;
  deviceToken: string;
  childId: string;
  childName: string;
};

// contactName é opcional: o pré-cadastro já vem preenchido (nome que o
// Responsável escolheu ao gerar o convite), mas o Contato pode ajustar
// antes de confirmar -- pedido do Marcelo ("depois se ele quiser pode
// alterar").
export async function confirmContactInvite(
  token: string,
  contactName?: string,
): Promise<ConfirmContactInviteResult> {
  const res = await fetch(`${API_URL}/api/contacts/invite/${encodeURIComponent(token)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contactName ? { contactName } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `confirm_contact_invite_failed_${res.status}`);
  }
  return res.json();
}
