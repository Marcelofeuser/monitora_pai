// Cliente pra tempo de uso / bloqueio temporário (item 11). Mesmo padrão
// de dois lados de location-api.ts: Responsável usa Bearer do Clerk,
// Criança usa X-Child-Token.
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

export type ScreenTimeStatus = {
  dailyLimitMinutes: number | null;
  minutesUsedToday: number;
  locked: boolean;
  lockReason: 'manual' | 'limit' | null;
};

export type ChildLockStatus = {
  locked: boolean;
  lockReason: 'manual' | 'limit' | null;
};

// --- Lado do Responsável ---

export async function fetchScreenTime(childId: string, authToken: string | null): Promise<ScreenTimeStatus> {
  const res = await fetch(`${API_URL}/api/screen-time/${encodeURIComponent(childId)}`, {
    headers: authHeaders(authToken),
  });
  if (!res.ok) throw new Error(`fetch_screen_time_failed_${res.status}`);
  return res.json();
}

export async function setDailyLimit(
  childId: string,
  dailyLimitMinutes: number | null,
  authToken: string | null,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/screen-time/${encodeURIComponent(childId)}/limit`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({ dailyLimitMinutes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `set_daily_limit_failed_${res.status}`);
  }
}

export async function setChildLock(
  childId: string,
  locked: boolean,
  authToken: string | null,
): Promise<void> {
  const res = await fetch(
    `${API_URL}/api/screen-time/${encodeURIComponent(childId)}/${locked ? 'lock' : 'unlock'}`,
    { method: 'POST', headers: authHeaders(authToken) },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `set_child_lock_failed_${res.status}`);
  }
}

// --- Lado da Criança ---

export async function fetchChildScreenTimeStatus(deviceToken: string): Promise<ChildLockStatus> {
  const res = await fetch(`${API_URL}/api/child/screen-time/status`, {
    headers: deviceHeaders(deviceToken),
  });
  if (!res.ok) throw new Error(`fetch_child_screen_time_status_failed_${res.status}`);
  return res.json();
}

export async function sendScreenTimeHeartbeat(deviceToken: string): Promise<ChildLockStatus> {
  const res = await fetch(`${API_URL}/api/child/screen-time/heartbeat`, {
    method: 'POST',
    headers: deviceHeaders(deviceToken),
  });
  if (!res.ok) throw new Error(`screen_time_heartbeat_failed_${res.status}`);
  return res.json();
}
