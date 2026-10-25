import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import express from "express";
import request from "supertest";

const context = vi.hoisted(() => ({
  schema: `pairing_test_${crypto.randomUUID().replaceAll("-", "")}`,
  authId: "parent-a",
  disconnect: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const schema = await import("../../../lib/db/src/schema/index");
  const url = process.env.PAIRING_TEST_DATABASE_URL;
  // Não usa DATABASE_URL e não aceita um banco cujo nome não termine em _test.
  if (url && !new URL(url).pathname.endsWith("_test")) {
    throw new Error("PAIRING_TEST_DATABASE_URL must reference a disposable *_test database");
  }
  if (!url) return { ...schema, pool: null, db: null };
  const connection = new URL(url);
  connection.searchParams.set("options", `-c search_path=${context.schema} -c timezone=UTC`);
  const previous = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = connection.toString();
    return await importOriginal();
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
vi.mock("@clerk/express", () => ({ getAuth: () => ({ userId: context.authId }) }));
vi.mock("../src/lib/parentUser", () => ({
  ensureParentUser: async (id: string) => ({ id }),
}));
vi.mock("../src/signaling/revocation", () => ({ disconnectDeviceSockets: context.disconnect }));

import { pool } from "@workspace/db";
import pairingRouter from "../src/routes/pairing";
import { consumePairingAttempt, pairingSourceHash } from "../src/lib/pairingRateLimit";

const app = express();
app.use(express.json());
app.use("/api", pairingRouter);
app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: "internal_error" });
});

describe.skipIf(!process.env.PAIRING_TEST_DATABASE_URL)("pareamento com PostgreSQL real", () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA ${context.schema}`);
    await pool.query(await readFile(new URL("./fixtures/pairing.sql", import.meta.url), "utf8"));
    const migration = await readFile(new URL("../../../lib/db/migrations/0002_pairing_schema_and_rate_limits.sql", import.meta.url), "utf8");
    await pool.query(migration);
    // Idempotência sobre a mesma estrutura, sem apagar dados.
    await pool.query(migration);
  });

  beforeEach(async () => {
    context.disconnect.mockReset();
    await pool.query("TRUNCATE users, pairing_tokens, child_device_tokens, child_guardians, pairing_rate_limits CASCADE");
    await pool.query("INSERT INTO users (id, role, name) VALUES ('parent-a','parent','Pai'), ('parent-b','parent','Mãe')");
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS ${context.schema} CASCADE`);
      await pool.end();
    }
  });

  async function seedReconnect(tokens = ["reconnect-a"], parentId = "parent-a") {
    await pool.query("INSERT INTO users (id, role, name, parent_id) VALUES ('child-a','child','Criança','parent-a')");
    await pool.query("INSERT INTO child_device_tokens (child_id, token_hash) VALUES ('child-a','old-hash')");
    for (const token of tokens) {
      await pool.query(`INSERT INTO pairing_tokens (token,parent_id,child_name,reconnect_child_id,expires_at)
        VALUES ($1,$2,'Criança','child-a',now()+interval '15 minutes')`, [token, parentId]);
    }
  }

  it("cria e confirma um QR com o schema migrado", async () => {
    const generated = await request(app).post("/api/pairing").send({ childName: "Nova", consent: true });
    expect(generated.status).toBe(201);
    const confirmed = await request(app).post("/api/pairing/confirm").send({ token: generated.body.token });
    expect(confirmed.status).toBe(200);
    const { rows } = await pool.query("SELECT token_hash FROM child_device_tokens");
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toBe(confirmed.body.deviceToken);
    expect(rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("aceita só 30 de 40 tentativas concorrentes e reinicia a janela", async () => {
    const hash = pairingSourceHash("confirm", "test-source");
    const results = await Promise.all(Array.from({ length: 40 }, () => consumePairingAttempt(hash, 30)));
    expect(results.filter((result) => result.allowed)).toHaveLength(30);
    expect(results.filter((result) => !result.allowed)).toHaveLength(10);
    await pool.query("UPDATE pairing_rate_limits SET window_started_at=now()-interval '16 minutes'");
    expect((await consumePairingAttempt(hash, 30)).allowed).toBe(true);
    expect((await pool.query("SELECT attempt_count, blocked_until FROM pairing_rate_limits")).rows[0])
      .toEqual({ attempt_count: 1, blocked_until: null });
  });

  it("consome o mesmo QR uma única vez com conexões concorrentes", async () => {
    await seedReconnect();
    const responses = await Promise.all([1, 2].map(() => request(app).post("/api/pairing/confirm").send({ token: "reconnect-a" })));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    const { rows } = await pool.query("SELECT id FROM child_device_tokens WHERE revoked_at IS NULL");
    expect(rows).toHaveLength(1);
  });

  it("serializa QRs distintos da mesma criança e mantém só uma credencial ativa", async () => {
    await seedReconnect(["reconnect-a", "reconnect-b"]);
    const responses = await Promise.all(["reconnect-a", "reconnect-b"].map((token) =>
      request(app).post("/api/pairing/confirm").send({ token })));
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect((await pool.query("SELECT id FROM child_device_tokens WHERE revoked_at IS NULL")).rows).toHaveLength(1);
    expect((await pool.query("SELECT id FROM child_device_tokens WHERE revoked_at IS NOT NULL")).rows).toHaveLength(2);
    expect(context.disconnect).toHaveBeenCalledTimes(2);
  });

  it("preserva credencial antiga e QR quando a inserção nova falha", async () => {
    await seedReconnect();
    await pool.query("ALTER TABLE child_device_tokens ADD CONSTRAINT force_insert_failure CHECK (token_hash='old-hash')");
    try {
      const response = await request(app).post("/api/pairing/confirm").send({ token: "reconnect-a" });
      expect(response.status).toBe(500);
      expect((await pool.query("SELECT revoked_at FROM child_device_tokens")).rows).toEqual([{ revoked_at: null }]);
      expect((await pool.query("SELECT used_at FROM pairing_tokens")).rows).toEqual([{ used_at: null }]);
      expect(context.disconnect).not.toHaveBeenCalled();
      // O contador vive fora da transação que sofreu rollback.
      expect((await pool.query("SELECT attempt_count FROM pairing_rate_limits")).rows).toEqual([{ attempt_count: 1 }]);
    } finally {
      await pool.query("ALTER TABLE child_device_tokens DROP CONSTRAINT force_insert_failure");
    }
  });

  it("recusa QR de responsável que perdeu o vínculo", async () => {
    await seedReconnect(["reconnect-a"], "parent-b");
    const response = await request(app).post("/api/pairing/confirm").send({ token: "reconnect-a" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("not_the_parent_of_this_child");
    expect((await pool.query("SELECT revoked_at FROM child_device_tokens")).rows).toEqual([{ revoked_at: null }]);
    expect(context.disconnect).not.toHaveBeenCalled();
  });
});
