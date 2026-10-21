import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../src/lib/pairingRateLimit", () => ({
  allowPairingAttempt: vi.fn(async () => true),
}));

vi.mock("@workspace/db", () => ({
  db: {},
  pairingTokensTable: {},
  usersTable: {},
  childDeviceTokensTable: {},
  childGuardiansTable: {},
}));

import pairingRouter from "../src/routes/pairing";

const app = express();
app.use(express.json());
app.use("/api", pairingRouter);

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/pairing/confirm — validação", () => {
  it("rejeita uma requisição sem token", async () => {
    const response = await request(app)
      .post("/api/pairing/confirm")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_body");
  });

  it("rejeita um token vazio", async () => {
    const response = await request(app)
      .post("/api/pairing/confirm")
      .send({ token: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_body");
  });
});
