const API_URL = import.meta.env.VITE_API_URL ?? '';

function authHeaders(token: string | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export type ChildDevice = {
  id: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: 'active' | 'revoked';
};

type ChildDevicesResponse = {
  devices: ChildDevice[];
};

type RevokeDeviceResponse = {
  ok: boolean;
  alreadyRevoked: boolean;
  revokedAt: string | null;
};

export async function fetchChildDevices(
  childId: string,
  authToken: string | null,
): Promise<ChildDevice[]> {
  const res = await fetch(
    `${API_URL}/api/children/${encodeURIComponent(childId)}/devices`,
    { headers: authHeaders(authToken) },
  );

  if (!res.ok) {
    throw new Error(`fetch_child_devices_failed_${res.status}`);
  }

  const data = (await res.json()) as ChildDevicesResponse;
  return data.devices;
}

export async function revokeChildDevice(
  childId: string,
  deviceId: string,
  authToken: string | null,
): Promise<RevokeDeviceResponse> {
  const res = await fetch(
    `${API_URL}/api/children/${encodeURIComponent(childId)}/devices/${encodeURIComponent(deviceId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(authToken),
    },
  );

  if (!res.ok) {
    throw new Error(`revoke_child_device_failed_${res.status}`);
  }

  return (await res.json()) as RevokeDeviceResponse;
}
