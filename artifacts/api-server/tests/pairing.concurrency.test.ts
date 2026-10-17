import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { db } from "@workspace/db";
import { pairingTokens, childDeviceTokens } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

describe("POST /pairing/confirm - Concurrency and Atomicity", () => {
  const testToken = "test-token-" + crypto.randomUUID();
  const childId = "child-uuid-test";
  const guardianId = "guardian-clerk-test";

  beforeEach(async () => {
    await db.delete(pairingTokens).where(eq(pairingTokens.token, testToken));
    await db.insert(pairingTokens).values({
      id: crypto.randomUUID(),
      token: testToken,
      pairingCode: "583194",
      childId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      createdAt: new Date(),
    });
  });

  it("deve permitir apenas uma confirmacao e rejeitar a concorrente com status 409 via FOR UPDATE", async () => {
    const payloadA = {
      token: testToken,
      pairingCode: "583194",
      guardianId,
      guardianEmail: "pai@exemplo.com",
      deviceName: "Dispositivo A",
    };
    const payloadB = {
      token: testToken,
      pairingCode: "583194",
      guardianId,
      guardianEmail: "pai@exemplo.com",
      deviceName: "Dispositivo B",
    };

    const [resA, resB] = await Promise.all([
      request(app).post("/pairing/confirm").send(payloadA),
      request(app).post("/pairing/confirm").send(payloadB),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const devices = await db
      .select()
      .from(childDeviceTokens)
      .where(eq(childDeviceTokens.childId, childId));
    expect(devices.length).toBe(1);
  });
});
