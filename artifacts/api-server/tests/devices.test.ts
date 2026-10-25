import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mocks = vi.hoisted(() => {
  const childDeviceTokensTable = {
    id: { name: "id" },
    childId: { name: "child_id" },
    createdAt: { name: "created_at" },
    lastUsedAt: { name: "last_used_at" },
    revokedAt: { name: "revoked_at" },
    tokenHash: { name: "token_hash" },
  };

  const db = {
    select: vi.fn(),
    update: vi.fn(),
  };

  const state: {
    authenticated: boolean;
    guardian: boolean;
    devices: Array<Record<string, unknown>>;
    selectedDevice: Record<string, unknown> | null;
    updatedDevice: Record<string, unknown> | null;
    childId: string;
  } = {
    authenticated: true,
    guardian: true,
    devices: [],
    selectedDevice: null,
    updatedDevice: null,
    childId: "child-1",
  };

  return { childDeviceTokensTable, db, state };
});

vi.mock("@clerk/express", () => ({
  getAuth: () => ({
    userId: mocks.state.authenticated ? "parent-1" : null,
  }),
}));

vi.mock("@workspace/db", () => ({
  db: mocks.db,
  childDeviceTokensTable: mocks.childDeviceTokensTable,
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => ({ type: "and", conditions }),
  desc: (column: unknown) => ({ type: "desc", column }),
  eq: (left: unknown, right: unknown) => ({ type: "eq", left, right }),
  isNull: (column: unknown) => ({ type: "isNull", column }),
}));

vi.mock("../src/signaling/revocation", () => ({
  disconnectDeviceSockets: vi.fn(),
}));

vi.mock("../src/lib/guardians", () => ({
  isGuardianOfChild: vi.fn(async (parentId: string, childId: string) =>
    parentId === "parent-1" &&
    childId === mocks.state.childId &&
    mocks.state.guardian
  ),
}));

import { disconnectDeviceSockets } from "../src/signaling/revocation";
import devicesRouter from "../src/routes/devices";

const app = express();
app.use(express.json());
app.use("/api", devicesRouter);

function configureDatabase() {
  const listQuery = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockImplementation(async () => mocks.state.devices),
    limit: vi.fn().mockImplementation(async () =>
      mocks.state.selectedDevice ? [mocks.state.selectedDevice] : []
    ),
  };

  mocks.db.select.mockReturnValue(listQuery);

  const updateQuery = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(async () =>
      mocks.state.updatedDevice ? [mocks.state.updatedDevice] : []
    ),
  };

  mocks.db.update.mockReturnValue(updateQuery);
}

beforeEach(() => {
  vi.clearAllMocks();

  mocks.state.authenticated = true;
  mocks.state.guardian = true;
  mocks.state.childId = "child-1";
  mocks.state.devices = [
    {
      id: "device-1",
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
      lastUsedAt: new Date("2026-01-02T10:00:00.000Z"),
      revokedAt: null,
    },
    {
      id: "device-2",
      createdAt: new Date("2026-01-03T10:00:00.000Z"),
      lastUsedAt: null,
      revokedAt: new Date("2026-01-04T10:00:00.000Z"),
    },
  ];

  mocks.state.selectedDevice = {
    id: "device-1",
    revokedAt: null,
  };

  mocks.state.updatedDevice = {
    id: "device-1",
    revokedAt: new Date("2026-02-01T12:00:00.000Z"),
  };

  configureDatabase();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/children/:childId/devices", () => {
  it("rejeita responsável não autenticado", async () => {
    mocks.state.authenticated = false;

    const response = await request(app)
      .get("/api/children/child-1/devices");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("not_authenticated");
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("rejeita quem não é responsável pela criança", async () => {
    mocks.state.guardian = false;

    const response = await request(app)
      .get("/api/children/child-1/devices");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("not_authorized_for_child");
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("lista dispositivos sem expor hashes ou tokens", async () => {
    const response = await request(app)
      .get("/api/children/child-1/devices");

    expect(response.status).toBe(200);
    expect(response.body.devices).toHaveLength(2);
    expect(response.body.devices[0].status).toBe("active");
    expect(response.body.devices[1].status).toBe("revoked");

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("token_hash");
    expect(serialized).not.toContain("secret-token");
  });
});

describe("DELETE /api/children/:childId/devices/:deviceId", () => {
  it("rejeita responsável não autenticado", async () => {
    mocks.state.authenticated = false;

    const response = await request(app)
      .delete("/api/children/child-1/devices/device-1");

    expect(response.status).toBe(401);
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it("rejeita quem não é responsável pela criança", async () => {
    mocks.state.guardian = false;

    const response = await request(app)
      .delete("/api/children/child-1/devices/device-1");

    expect(response.status).toBe(403);
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it("retorna 404 quando o dispositivo não existe", async () => {
    mocks.state.selectedDevice = null;

    const response = await request(app)
      .delete("/api/children/child-1/devices/inexistente");

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("device_not_found");
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it("revoga o dispositivo selecionado", async () => {
    const response = await request(app)
      .delete("/api/children/child-1/devices/device-1");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.alreadyRevoked).toBe(false);
    expect(response.body.revokedAt).toBeTruthy();
    expect(mocks.db.update).toHaveBeenCalledTimes(1);
    expect(disconnectDeviceSockets).toHaveBeenCalledTimes(1);
    expect(disconnectDeviceSockets).toHaveBeenCalledWith("device-1");
  });

  it("não altera novamente um dispositivo já revogado", async () => {
    const originalRevocation = new Date("2026-01-04T10:00:00.000Z");
    mocks.state.selectedDevice = {
      id: "device-2",
      revokedAt: originalRevocation,
    };

    const response = await request(app)
      .delete("/api/children/child-1/devices/device-2");

    expect(response.status).toBe(200);
    expect(response.body.alreadyRevoked).toBe(true);
    expect(new Date(response.body.revokedAt).toISOString())
      .toBe(originalRevocation.toISOString());
    expect(mocks.db.update).not.toHaveBeenCalled();
    expect(disconnectDeviceSockets).toHaveBeenCalledTimes(1);
    expect(disconnectDeviceSockets).toHaveBeenCalledWith("device-2");
  });
});
