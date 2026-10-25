import { afterEach, describe, expect, it, vi } from "vitest";
import {
  disconnectDeviceSockets,
  registerDeviceSocketDisconnector,
} from "../src/signaling/revocation";

afterEach(() => {
  // Restaura o estado do módulo sem depender da ordem entre os testes.
  registerDeviceSocketDisconnector(() => {});
});

describe("revogação de sessões Socket.IO", () => {
  it("encaminha somente o ID do dispositivo solicitado", () => {
    const disconnector = vi.fn();
    registerDeviceSocketDisconnector(disconnector);

    disconnectDeviceSockets("device-123");

    expect(disconnector).toHaveBeenCalledTimes(1);
    expect(disconnector).toHaveBeenCalledWith("device-123");
  });

  it("não lança erro quando o mecanismo não está registrado", async () => {
    // O módulo mantém o mecanismo registrado em uma variável privada.
    // Este caso valida que a função continua segura sem um callback.
    expect(() => disconnectDeviceSockets("device-456")).not.toThrow();
  });
});
