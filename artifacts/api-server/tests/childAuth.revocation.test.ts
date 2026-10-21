import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => {
  const childDeviceTokensTable = {
    id: { name: "id" },
    tokenHash: { name: "token_hash" },
  };

  const state: {
    row: Record<string, unknown> | null;
    updateShouldFail: boolean;
  } = {
    row: null,
    updateShouldFail: false,
  };

  const db = {
    select: vi.fn(),
    update: vi.fn(),
  };

  return { childDeviceTokensTable, state, db };
});

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  childDeviceTokensTable: mocks.childDeviceTokensTable,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left, right) => ({ left, right })),
}));

import { requireChildAuth } from "../src/middlewares/childAuth";

const app = express();

app.get("/protected", requireChildAuth, (req, res) => {
  res.json({ childId: (req as typeof req & { childId?: string }).childId });
});

function configureDatabase(row: Record<string, unknown> | null) {
  mocks.state.row = row;

  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () =>
      mocks.state.row ? [mocks.state.row] : [],
    ),
  };

  mocks.db.select.mockReturnValue(query);

  const updateQuery = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockImplementation(() =>
      mocks.state.updateShouldFail
        ? Promise.reject(new Error("simulated update failure"))
        : Promise.resolve(),
    ),
  };

  mocks.db.update.mockReturnValue(updateQuery);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

beforeEach(() => {
  mocks.state.updateShouldFail = false;
  vi.clearAllMocks();
  configureDatabase({
    id: "device-1",
    childId: "child-1",
    tokenHash: tokenHash("valid-device-token"),
    revokedAt: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireChildAuth — revogação de dispositivos", () => {
  it("rejeita token ausente", async () => {
    const response = await request(app).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("not_authenticated");
  });

  it("rejeita token desconhecido", async () => {
    configureDatabase(null);

    const response = await request(app)
      .get("/protected")
      .set("X-Child-Token", "unknown-token");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("not_authenticated");
  });

  it("rejeita token revogado", async () => {
    configureDatabase({
      id: "device-1",
      childId: "child-1",
      tokenHash: tokenHash("revoked-device-token"),
      revokedAt: new Date(),
    });

    const response = await request(app)
      .get("/protected")
      .set("X-Child-Token", "revoked-device-token");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("not_authenticated");
  });

  it("aceita token válido e disponibiliza o childId", async () => {
    const response = await request(app)
      .get("/protected")
      .set("X-Child-Token", "valid-device-token");

    expect(response.status).toBe(200);
    expect(response.body.childId).toBe("child-1");
  });

  it("não bloqueia acesso se a atualização de lastUsedAt falhar", async () => {
    mocks.state.updateShouldFail = true;

    const response = await request(app)
      .get("/protected")
      .set("X-Child-Token", "valid-device-token");

    expect(response.status).toBe(200);
    expect(response.body.childId).toBe("child-1");
  });
});
