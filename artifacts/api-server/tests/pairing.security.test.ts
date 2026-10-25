import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => {
  const pairingTokensTable = {
    token: {},
    id: {},
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

  const tx = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };

  const db = {
    transaction: vi.fn(),
  };

  return {
    pairingTokensTable,
    usersTable,
    childDeviceTokensTable,
    childGuardiansTable,
    tx,
    db,
    pairing: null as Record<string, unknown> | null,
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

function configurePairingResult(
  pairing: Record<string, unknown> | null,
) {
  mocks.pairing = pairing;

  const limit = vi.fn().mockImplementation(async () => ({
    rows: [],
  }));

  // Drizzle retorna arrays de registros, não objetos com "rows".
  limit.mockImplementation(async () =>
    mocks.pairing ? [mocks.pairing] : [],
  );

  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit,
  };

  mocks.tx.select.mockReturnValue(query);

  mocks.db.transaction.mockImplementation(
    async (callback: (tx: typeof mocks.tx) => unknown) =>
      callback(mocks.tx),
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/pairing/confirm — segurança do QR", () => {
  it("rejeita um QR inexistente", async () => {
    configurePairingResult(null);

    const response = await request(app)
      .post("/api/pairing/confirm")
      .send({ token: "qr-inexistente" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_or_expired_token");
  });

  it("rejeita um QR já utilizado", async () => {
    configurePairingResult({
      id: "pairing-1",
      token: "qr-utilizado",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      parentId: "parent-1",
      childName: "Criança",
      reconnectChildId: null,
    });

    const response = await request(app)
      .post("/api/pairing/confirm")
      .send({ token: "qr-utilizado" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_or_expired_token");
  });

  it("rejeita um QR expirado", async () => {
    configurePairingResult({
      id: "pairing-2",
      token: "qr-expirado",
      usedAt: null,
      expiresAt: new Date(Date.now() - 60_000),
      parentId: "parent-1",
      childName: "Criança",
      reconnectChildId: null,
    });

    const response = await request(app)
      .post("/api/pairing/confirm")
      .send({ token: "qr-expirado" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_or_expired_token");
  });
});
