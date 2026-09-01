// Cliente para os endpoints reais de pareamento no api-server.
//
// Usa token Bearer (não cookie) porque PWA e api-server são serviços
// separados no Railway, em domínios diferentes — cookies não atravessam
// domínios diferentes de forma confiável, mas um header Authorization sim.
// O token vem do Clerk (getToken()) no componente que chama esta função.
//
// A URL do backend vem de uma variável de ambiente de build (VITE_API_URL)
// em vez de um caminho relativo, pelo mesmo motivo (domínios diferentes).
const API_URL = import.meta.env.VITE_API_URL ?? '';

function authHeaders(token?: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type CreatePairingResponse = {
  token: string;
  joinUrl: string;
  expiresAt: string;
};

export async function createPairing(
  input: { childName: string; childAge?: string },
  authToken: string | null,
): Promise<CreatePairingResponse> {
  const res = await fetch(`${API_URL}/api/pairing`, {
    method: "POST",
    headers: authHeaders(authToken),
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `pairing_request_failed_${res.status}`);
  }

  return res.json();
}

export type ConfirmPairingResponse = {
  childUserId: string;
  parentId: string;
  childName: string;
  // Credencial do aparelho da Criança — ela não tem conta Clerk, então este
  // token (guardado no localStorage dela) é o que autentica as rotas que o
  // aparelho dela precisa chamar (hoje: reportar localização).
  deviceToken: string;
};

// Sem token: a Criança ainda não tem conta nesse momento, é exatamente
// o pedido que cria a conta dela. O endpoint /api/pairing/confirm é público
// por natureza (protegido pelo token de pareamento em si, não por login).
export async function confirmPairing(pairingToken: string): Promise<ConfirmPairingResponse> {
  const res = await fetch(`${API_URL}/api/pairing/confirm`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ token: pairingToken }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `pairing_confirm_failed_${res.status}`);
  }

  return res.json();
}
