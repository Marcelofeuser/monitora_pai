// Cliente para localização real. Dois lados diferentes de autenticação:
// - O Responsável consulta com o token Bearer do Clerk (mesmo padrão de
//   conversations-api.ts / pairing-api.ts).
// - A Criança reporta a posição com o token de dispositivo (não usa Clerk —
//   ver deviceToken em pairing-api.ts / middlewares/childAuth.ts no backend),
//   mandado no header X-Child-Token.
const API_URL = import.meta.env.VITE_API_URL ?? '';

function authHeaders(token?: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function deviceHeaders(deviceToken: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Child-Token': deviceToken,
  };
}

export type ChildLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
};

// Retorna null quando a Criança nunca compartilhou nada ainda — nunca é um
// erro, é o estado normal de "ainda não aconteceu".
export async function fetchChildLocation(
  childId: string,
  authToken: string | null,
): Promise<ChildLocation | null> {
  const res = await fetch(`${API_URL}/api/location/${encodeURIComponent(childId)}`, {
    headers: authHeaders(authToken),
  });
  if (!res.ok) throw new Error(`fetch_location_failed_${res.status}`);
  const body = await res.json();
  return body ?? null;
}

export async function reportLocation(
  deviceToken: string,
  input: { latitude: number; longitude: number; accuracyMeters?: number },
): Promise<void> {
  const res = await fetch(`${API_URL}/api/location`, {
    method: 'POST',
    headers: deviceHeaders(deviceToken),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `report_location_failed_${res.status}`);
  }
}
