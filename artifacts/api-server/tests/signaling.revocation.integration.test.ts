import { createHash } from "node:crypto";
import { createServer, type AddressInfo } from "node:http";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const childDeviceTokensTable = {
    tokenHash: { name: "token_hash" },
  };

  const contactDeviceTokensTable = {
    tokenHash: { name: "contact_token_hash" },
  };

  const usersTable = {
    id: { name: "id" },
    name: { name: "name" },
  };

  const state: {
    childRowsByHash: Map<string, Record<string, unknown>>;
  } = {
    childRowsByHash: new Map(),
  };

  const db = {
    select: vi.fn(),
  };

  return {
    childDeviceTokensTable,
    contactDeviceTokensTable,
    usersTable,
    state,
    db,
  };
});

vi.mock("@workspace/db", () => ({
  childDeviceTokensTable: mocks.childDeviceTokensTable,
  contactDeviceTokensTable: mocks.contactDeviceTokensTable,
  usersTable: mocks.usersTable,
  db: mocks.db,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column, value) => ({ column, value })),
  and: vi.fn((...conditions) => ({ conditions })),
  inArray: vi.fn((column, values) => ({ column, values })),
}));

vi.mock("@clerk/express", () => ({
  clerkClient: {
    authenticateRequest: vi.fn(),
  },
}));

vi.mock("../src/lib/calls", () => ({
  authorizeCall: vi.fn(),
}));

vi.mock("../src/signaling/push", () => ({
  sendIncomingCallPush: vi.fn(),
}));

vi.mock("../src/signaling/callState", () => ({
  callRegistry: {
    getById: vi.fn(() => null),
    getActiveFor: vi.fn(() => null),
  },
  finishCall: vi.fn(),
  markAnswered: vi.fn(),
  startCall: vi.fn(),
}));

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { attachSignaling } from "../src/signaling/index";
import { disconnectDeviceSockets } from "../src/signaling/revocation";

type SocketClient = {
  connected: boolean;
  disconnect: () => SocketClient;
  on: (event: string, listener: (...args: unknown[]) => void) => SocketClient;
  once: (event: string, listener: (...args: unknown[]) => void) => SocketClient;
  close: () => SocketClient;
};

type SocketClientFactory = (
  uri: string,
  options: Record<string, unknown>,
) => SocketClient;

const pwaRequire = createRequire(
  new URL("../../controle-parental-pwa/package.json", import.meta.url),
);

const socketClientModule = pwaRequire("socket.io-client") as {
  io: SocketClientFactory;
};

const tokenA = "integration-device-token-A";
const tokenB = "integration-device-token-B";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function configureDatabase(): void {
  mocks.db.select.mockImplementation(() => {
    let currentTable: unknown;
    let condition: { value?: unknown } | undefined;

    const query = {
      from(table: unknown) {
        currentTable = table;
        return query;
      },
      where(value: { value?: unknown }) {
        condition = value;
        return query;
      },
      limit: async () => {
        if (currentTable === mocks.childDeviceTokensTable) {
          const row = mocks.state.childRowsByHash.get(
            String(condition?.value ?? ""),
          );
          return row ? [row] : [];
        }

        return [];
      },
    };

    return query;
  });
}

function waitForEvent(
  socket: SocketClient,
  event: string,
  timeoutMs = 5000,
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout aguardando evento Socket.IO: ${event}`));
    }, timeoutMs);

    socket.once(event, (...args: unknown[]) => {
      clearTimeout(timeout);
      resolve(args);
    });
  });
}

function connectClient(
  uri: string,
  token: string,
): SocketClient {
  return socketClientModule.io(uri, {
    path: "/socket.io",
    transports: ["websocket"],
    reconnection: false,
    timeout: 4000,
    auth: { childToken: token },
  });
}

describe("integração de revogação de dispositivos Socket.IO", () => {
  let httpServer: ReturnType<typeof createServer>;
  let signalingServer: ReturnType<typeof attachSignaling>;
  let clientA1: SocketClient | undefined;
  let clientA2: SocketClient | undefined;
  let clientB: SocketClient | undefined;
  let rejectedClient: SocketClient | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.state.childRowsByHash.clear();

    mocks.state.childRowsByHash.set(hashToken(tokenA), {
      id: "device-A",
      childId: "child-1",
      revokedAt: null,
    });

    mocks.state.childRowsByHash.set(hashToken(tokenB), {
      id: "device-B",
      childId: "child-1",
      revokedAt: null,
    });

    configureDatabase();

    httpServer = createServer();
    signalingServer = attachSignaling(httpServer);

    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", resolve);
    });

    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    clientA1?.close();
    clientA2?.close();
    clientB?.close();
    rejectedClient?.close();

    clientA1 = undefined;
    clientA2 = undefined;
    clientB = undefined;
    rejectedClient = undefined;

    await new Promise<void>((resolve) => {
      signalingServer.close(() => resolve());
    });

    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  it("desconecta somente as sessões do dispositivo revogado e rejeita nova conexão", async () => {
    clientA1 = connectClient(baseUrl, tokenA);
    clientA2 = connectClient(baseUrl, tokenA);
    clientB = connectClient(baseUrl, tokenB);

    const connectedA1 = waitForEvent(clientA1, "connect");
    const connectedA2 = waitForEvent(clientA2, "connect");
    const connectedB = waitForEvent(clientB, "connect");

    await Promise.all([connectedA1, connectedA2, connectedB]);

    expect(clientA1.connected).toBe(true);
    expect(clientA2.connected).toBe(true);
    expect(clientB.connected).toBe(true);

    const disconnectedA1 = waitForEvent(clientA1, "disconnect");
    const disconnectedA2 = waitForEvent(clientA2, "disconnect");

    const rowA = mocks.state.childRowsByHash.get(hashToken(tokenA));
    expect(rowA).toBeDefined();

    // Simula a alteração persistida pela rota de revogação.
    rowA!.revokedAt = new Date();

    // Exercita o callback registrado pelo attachSignaling real.
    disconnectDeviceSockets("device-A");

    const [disconnectA1Args, disconnectA2Args] = await Promise.all([
      disconnectedA1,
      disconnectedA2,
    ]);

    expect(disconnectA1Args[0]).toBe("io server disconnect");
    expect(disconnectA2Args[0]).toBe("io server disconnect");

    expect(clientA1.connected).toBe(false);
    expect(clientA2.connected).toBe(false);
    expect(clientB.connected).toBe(true);

    // Um token revogado não pode abrir uma nova sessão.
    rejectedClient = connectClient(baseUrl, tokenA);
    const connectionError = await waitForEvent(
      rejectedClient,
      "connect_error",
    );

    expect(String((connectionError[0] as Error).message)).toBe(
      "not_authenticated",
    );

    // O dispositivo B continua conectado após a tentativa recusada.
    expect(clientB.connected).toBe(true);
  });
});
