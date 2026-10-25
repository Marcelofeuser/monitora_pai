import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => {
  const pairingTokensTable = {
    id: {},
    token: {},
    usedAt: {},
    expiresAt: {},
  };

  const usersTable = {
    id: {},
  };

  const childDeviceTokensTable = {
    childId: {},
    tokenHash: {},
  };

  const childGuardiansTable = {
    childId: {},
    parentId: {},
  };

  const state = {
    pairing: null as Record<string, any> | null,
    users: [] as Record<string, any>[],
    devices: [] as Record<string, any>[],
    guardians: [] as Record<string, any>[],
    forUpdateCalls: 0,
    transactionCalls: 0,
  };

  let lockTail: Promise<void> = Promise.resolve();

  const db = {
    transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => {
      state.transactionCalls += 1;

      let releaseLock: (() => void) | undefined;

      const tx = {
        select: vi.fn(() => {
          let selectedTable: any;

          const query: any = {
            from: vi.fn((table: any) => {
              selectedTable = table;
              return query;
            }),
            where: vi.fn(() => query),
            for: vi.fn((mode: string) => {
              if (selectedTable === pairingTokensTable && mode === "update") {
                state.forUpdateCalls += 1;
              }
              return query;
            }),
            limit: vi.fn(async () => {
              if (selectedTable === pairingTokensTable) {
                // Simula a serialização do FOR UPDATE até o fim
                // da transação, sem abrir conexão com PostgreSQL.
                const previous = lockTail;
                let unlock!: () => void;

                lockTail = new Promise<void>((resolve) => {
                  unlock = resolve;
                });

                await previous;
                releaseLock = unlock;

                return state.pairing ? [{ ...state.pairing }] : [];
              }

              if (selectedTable === usersTable) {
                return [];
              }

              return [];
            }),
          };

          return query;
        }),

        update: vi.fn(() => {
          let values: Record<string, any>;

          const updateQuery: any = {
            set: vi.fn((data: Record<string, any>) => {
              values = data;
              return updateQuery;
            }),
            where: vi.fn(() => updateQuery),
            returning: vi.fn(async () => {
              if (!state.pairing) return [];

              Object.assign(state.pairing, values);
              return [{ id: state.pairing.id }];
            }),
          };

          return updateQuery;
        }),

        insert: vi.fn((table: any) => {
          let values: Record<string, any>;

          const insertQuery: any = {
            values: vi.fn((data: Record<string, any>) => {
              values = data;
              return insertQuery;
            }),
            returning: vi.fn(async () => {
              if (table === usersTable) {
                state.users.push({ ...values });
                return [{ ...values }];
              }

              return [];
            }),
            onConflictDoNothing: vi.fn(async () => undefined),
          };

          if (table === childDeviceTokensTable) {
            insertQuery.values = vi.fn(async (data: Record<string, any>) => {
              state.devices.push({ ...data });
              return undefined;
            });
          }

          if (table === childGuardiansTable) {
            insertQuery.values = vi.fn(() => insertQuery);
          }

          return insertQuery;
        }),
      };

      return Promise.resolve()
        .then(() => callback(tx))
        .finally(() => releaseLock?.());
    }),
  };

  return {
    db,
    pairingTokensTable,
    usersTable,
    childDeviceTokensTable,
    childGuardiansTable,
    state,
    resetLock: () => {
      lockTail = Promise.resolve();
    },
  };
});

vi.mock("../src/lib/pairingRateLimit", () => ({
  allowPairingAttempt: vi.fn(async () => true),
}));

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  pairingTokensTable: mocks.pairingTokensTable,
  usersTable: mocks.usersTable,
  childDeviceTokensTable: mocks.childDeviceTokensTable,
  childGuardiansTable: mocks.childGuardiansTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left, right) => ({ left, right })),
  and: vi.fn((...conditions) => conditions),
  isNull: vi.fn((column) => ({ column })),
}));

vi.mock("../src/lib/parentUser", () => ({
  ensureParentUser: vi.fn(),
}));

vi.mock("../src/lib/guardians", () => ({
  isGuardianOfChild: vi.fn(),
}));

import pairingRouter from "../src/routes/pairing";

const app = express();
app.use(express.json());
app.use("/api", pairingRouter);

beforeEach(() => {
  mocks.resetLock();

  mocks.state.pairing = {
    id: "pairing-test-1",
    token: "qr-concorrente",
    parentId: "parent-test-1",
    childName: "Criança de teste",
    childAge: "10",
    consentAcceptedAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    resultingChildUserId: null,
    reconnectChildId: null,
  };

  mocks.state.users = [];
  mocks.state.devices = [];
  mocks.state.guardians = [];
  mocks.state.forUpdateCalls = 0;
  mocks.state.transactionCalls = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/pairing/confirm — concorrência isolada", () => {
  it("permite consumir o mesmo QR apenas uma vez em duas requisições concorrentes", async () => {
    const [responseA, responseB] = await Promise.all([
      request(app)
        .post("/api/pairing/confirm")
        .send({ token: "qr-concorrente" }),
      request(app)
        .post("/api/pairing/confirm")
        .send({ token: "qr-concorrente" }),
    ]);

    expect([responseA.status, responseB.status].sort()).toEqual([200, 400]);

    expect(mocks.state.transactionCalls).toBe(2);
    expect(mocks.state.forUpdateCalls).toBe(2);
    expect(mocks.state.pairing?.usedAt).toBeInstanceOf(Date);
    expect(mocks.state.users).toHaveLength(1);
    expect(mocks.state.devices).toHaveLength(1);

    const successfulResponse =
      responseA.status === 200 ? responseA : responseB;

    expect(successfulResponse.body.childUserId).toBeDefined();
    expect(successfulResponse.body.deviceToken).toBeDefined();
    expect(mocks.state.pairing?.resultingChildUserId).toBe(
      successfulResponse.body.childUserId,
    );
  });
});
