import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), transaction: vi.fn(), userId: "parent-a" as string | null }));
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: mocks.userId }) }));
vi.mock("../src/lib/parentUser", () => ({ ensureParentUser: vi.fn() }));
vi.mock("@workspace/db", () => ({
  db: mocks, pairingTokensTable: {}, usersTable: {},
  childDeviceTokensTable: {}, childGuardiansTable: {},
}));

import { allowPairingAttempt, pairingSourceHash, pairingRateLimitSecret } from "../src/lib/pairingRateLimit";
import pairingRouter from "../src/routes/pairing";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  mocks.userId = "parent-a";
});

describe("limite persistente de pareamento", () => {
  it("compartilha a cota de geração e reconexão por responsável", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ attempt_count: 21, retry_after: 300 }] });
    const app = express();
    app.use(express.json());
    app.use("/api", pairingRouter);
    expect((await request(app).post("/api/pairing").send({})).status).toBe(429);
    expect((await request(app).post("/api/pairing/reconnect").send({})).status).toBe(429);
    const dialect = new PgDialect();
    const hashes = mocks.execute.mock.calls.map(([statement]) => dialect.sqlToQuery(statement).params[1]);
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[0]).toBe(pairingSourceHash("generate", "parent-a"));
  });

  it("recusa geração sem autenticação antes de acessar o contador", async () => {
    mocks.userId = null;
    const app = express();
    app.use(express.json());
    app.use("/api", pairingRouter);
    expect((await request(app).post("/api/pairing").send({})).status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("nega a confirmação com 429 e Retry-After antes de consultar o QR", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ attempt_count: 31, retry_after: 120 }] });
    const app = express();
    app.use(express.json());
    app.use("/api", pairingRouter);
    const response = await request(app).post("/api/pairing/confirm").send({ token: "qr" });
    expect(response.status).toBe(429);
    expect(response.headers["retry-after"]).toBe("120");
    expect(response.body).toEqual({ error: "pairing_rate_limited", retryAfter: 120 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("conta também corpos inválidos e permite a tentativa de número 30", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ attempt_count: 30, retry_after: 50 }] });
    const app = express();
    app.use(express.json());
    app.use("/api", pairingRouter);
    const response = await request(app).post("/api/pairing/confirm").send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_body");
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("não libera o pareamento quando o contador falha", async () => {
    mocks.execute.mockRejectedValue(new Error("database offline"));
    const app = express();
    app.use(express.json());
    app.use("/api", pairingRouter);
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: "internal_error" });
    });
    const response = await request(app).post("/api/pairing/confirm").send({ token: "qr" });
    expect(response.status).toBe(500);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("ignora X-Forwarded-For quando o proxy não é confiável", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ attempt_count: 1, retry_after: 900 }] });
    const app = express();
    app.post("/limit", async (req, res) => {
      if (await allowPairingAttempt(req, res, "confirm")) res.sendStatus(204);
    });
    await request(app).post("/limit").set("X-Forwarded-For", "1.2.3.4");
    await request(app).post("/limit").set("X-Forwarded-For", "9.8.7.6");
    const dialect = new PgDialect();
    const first = dialect.sqlToQuery(mocks.execute.mock.calls[0][0]);
    const second = dialect.sqlToQuery(mocks.execute.mock.calls[1][0]);
    expect(first.params[1]).toBe(second.params[1]);
    expect(first.params).not.toContain("1.2.3.4");
  });

  it("separa responsáveis/escopos sem persistir os identificadores originais", () => {
    vi.stubEnv("PAIRING_RATE_LIMIT_SECRET", "a".repeat(64));
    const hash = pairingSourceHash("generate", "parent-a");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(pairingSourceHash("generate", "parent-b"));
    expect(hash).not.toBe(pairingSourceHash("confirm", "parent-a"));
    vi.stubEnv("PAIRING_RATE_LIMIT_SECRET", "b".repeat(64));
    expect(hash).not.toBe(pairingSourceHash("generate", "parent-a"));
  });

  it("exige segredo persistente com pelo menos 32 caracteres em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PAIRING_RATE_LIMIT_SECRET", "");
    expect(() => pairingRateLimitSecret()).toThrow("PAIRING_RATE_LIMIT_SECRET");
    vi.stubEnv("PAIRING_RATE_LIMIT_SECRET", "short");
    expect(() => pairingRateLimitSecret()).toThrow("PAIRING_RATE_LIMIT_SECRET");
    vi.stubEnv("PAIRING_RATE_LIMIT_SECRET", "c".repeat(64));
    expect(pairingRateLimitSecret()).toBe("c".repeat(64));
  });
});
