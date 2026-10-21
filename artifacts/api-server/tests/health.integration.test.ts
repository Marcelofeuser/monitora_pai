import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const mocks = vi.hoisted(() => ({ clerk: vi.fn() }));
vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (req: unknown, res: { status: (code: number) => { json: (body: unknown) => void } }) => {
    mocks.clerk(req);
    res.status(401).json({ error: "auth_unavailable_in_test" });
  },
}));
vi.mock("../src/routes", async () => {
  const { Router } = await import("express");
  const router = Router();
  router.get("/protected", (_req, res) => res.sendStatus(204));
  return { default: router };
});
vi.mock("../src/lib/pairingRateLimit", () => ({ pairingRateLimitSecret: vi.fn() }));

import app from "../src/app";

beforeEach(() => mocks.clerk.mockClear());

describe("GET /api/healthz antes da autenticação", () => {
  it("retorna 200 sem consultar o Clerk, inclusive com Bearer inválido", async () => {
    const response = await request(app).get("/api/healthz").set("Authorization", "Bearer invalid");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(mocks.clerk).not.toHaveBeenCalled();
  });

  it("aceita HEAD sem exigir sessão", async () => {
    expect((await request(app).head("/api/healthz")).status).toBe(200);
    expect(mocks.clerk).not.toHaveBeenCalled();
  });

  it("mantém a autenticação nas demais rotas", async () => {
    expect((await request(app).get("/api/protected")).status).toBe(401);
    expect(mocks.clerk).toHaveBeenCalledOnce();
  });

  it("mantém CORS e permite ler Retry-After entre domínios", async () => {
    const response = await request(app).get("/api/healthz").set("Origin", "https://staging.example.com");
    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://staging.example.com");
    expect(response.headers["access-control-expose-headers"]).toBe("Retry-After");
  });
});
