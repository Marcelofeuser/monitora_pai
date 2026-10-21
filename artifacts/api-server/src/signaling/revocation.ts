type DeviceSocketDisconnector = (deviceId: string) => void;

let deviceSocketDisconnector: DeviceSocketDisconnector | null = null;

/** Registra o mecanismo do servidor Socket.IO ativo. */
export function registerDeviceSocketDisconnector(
  disconnector: DeviceSocketDisconnector,
): void {
  deviceSocketDisconnector = disconnector;
}

/** Desconecta as sessões associadas exclusivamente ao dispositivo revogado. */
export function disconnectDeviceSockets(deviceId: string): void {
  deviceSocketDisconnector?.(deviceId);
}
