import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => {
  const tables = {
    childDeviceTokensTable: { name: "child_device_tokens" },
    contactDeviceTokensTable: { name: "contact_device_tokens" },
    contactsTable: { name: "contacts" },
    conversationsTable: { name: "conversations" },
    groupMembersTable: { name: "group_members" },
    groupMessagesTable: { name: "group_messages" },
    groupsTable: { name: "groups" },
    messagesTable: { name: "messages" },
    mirrorLogTable: { name: "mirror_log" },
    usersTable: { name: "users" },
  };

  const state: {
    currentTable: unknown;
    childRow: Record<string, unknown> | null;
  } = {
    currentTable: null,
    childRow: null,
  };

  const db = {
    select: vi.fn(),
  };

  const media = {
    isValidMediaFilename: vi.fn(() => true),
    mediaFileExists: vi.fn(),
    mediaFilePath: vi.fn(),
    contentTypeForFilename: vi.fn(),
  };

  const turn = {
    issueTurnCredentials: vi.fn(),
  };

  return { tables, state, db, media, turn };
});

vi.mock("@workspace/db", () => ({
  ...mocks.tables,
  db: mocks.db,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((left, right) => ({ left, right })),
  and: vi.fn((...conditions) => ({ conditions })),
}));

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: null })),
}));

vi.mock("../src/lib/turn", () => ({
  issueTurnCredentials: mocks.turn.issueTurnCredentials,
}));

vi.mock("../src/lib/mediaStorage", () => mocks.media);

vi.mock("../src/lib/guardians", () => ({
  isGuardianOfChild: vi.fn(),
}));

import callsRouter from "../src/routes/calls";
import mediaRouter from "../src/routes/media";

const app = express();
app.use("/api", callsRouter);
app.use("/api", mediaRouter);

const revokedToken = "revoked-device-token";
const mediaFilename = "11111111-1111-4111-8111-111111111111.jpg";

function configureDatabase() {
  const query = {
    from: vi.fn((table: unknown) => {
      mocks.state.currentTable = table;
      return query;
    }),
    where: vi.fn(() => query),
    limit: vi.fn(async () => {
      if (mocks.state.currentTable === mocks.tables.childDeviceTokensTable) {
        return mocks.state.childRow ? [mocks.state.childRow] : [];
      }

      return [];
    }),
  };

  mocks.db.select.mockImplementation(() => query);
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.state.currentTable = null;
  mocks.state.childRow = {
    id: "device-1",
    childId: "child-1",
    tokenHash: "mocked-token-hash",
    revokedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  mocks.media.isValidMediaFilename.mockReturnValue(true);
  mocks.media.mediaFileExists.mockResolvedValue(true);
  mocks.turn.issueTurnCredentials.mockResolvedValue([
    { urls: ["turn:example.invalid"] },
  ]);

  configureDatabase();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Revogação de dispositivos — rotas HTTP", () => {
  it("rejeita token revogado ao solicitar credenciais TURN", async () => {
    const response = await request(app)
      .post("/api/calls/turn-credentials")
      .set("X-Child-Token", revokedToken);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("not_authenticated");
    expect(mocks.turn.issueTurnCredentials).not.toHaveBeenCalled();
  });

  it("rejeita token revogado antes de consultar ou transmitir mídia", async () => {
    const response = await request(app)
      .get(`/api/media/${mediaFilename}`)
      .set("X-Child-Token", revokedToken);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("not_authenticated");
    expect(mocks.media.mediaFileExists).not.toHaveBeenCalled();
    expect(mocks.media.mediaFilePath).not.toHaveBeenCalled();

    // As consultas devem limitar-se à validação dos tokens.
    expect(mocks.db.select).toHaveBeenCalledTimes(1);
  });
});
