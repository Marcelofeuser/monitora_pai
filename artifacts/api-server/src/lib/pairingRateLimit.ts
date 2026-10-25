import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { Request, Response } from "express";

const WINDOW_SECONDS = 15 * 60;
const developmentSecret = randomBytes(32).toString("hex");

export function pairingRateLimitSecret(): string {
  const secret = process.env.PAIRING_RATE_LIMIT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PAIRING_RATE_LIMIT_SECRET must contain at least 32 characters");
  }
  return developmentSecret;
}

/** HMAC evita persistir IP/Clerk ID ou um hash de IP facilmente enumerável. */
export function pairingSourceHash(scope: string, source: string): string {
  return createHmac("sha256", pairingRateLimitSecret())
    .update(JSON.stringify([scope, source]))
    .digest("hex");
}

/** Uma única instrução serializa o contador no PostgreSQL, inclusive entre réplicas. */
export async function consumePairingAttempt(sourceHash: string, limit: number) {
  const result = await db.execute<{ attempt_count: number; retry_after: number }>(sql`
    INSERT INTO pairing_rate_limits AS bucket
      (id, source_hash, window_started_at, attempt_count, created_at, updated_at)
    VALUES (${randomUUID()}, ${sourceHash}, statement_timestamp() AT TIME ZONE 'UTC', 1,
      statement_timestamp() AT TIME ZONE 'UTC', statement_timestamp() AT TIME ZONE 'UTC')
    ON CONFLICT (source_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN bucket.window_started_at <= (statement_timestamp() AT TIME ZONE 'UTC') - make_interval(secs => ${WINDOW_SECONDS})
        THEN statement_timestamp() AT TIME ZONE 'UTC' ELSE bucket.window_started_at END,
      attempt_count = CASE
        WHEN bucket.window_started_at <= (statement_timestamp() AT TIME ZONE 'UTC') - make_interval(secs => ${WINDOW_SECONDS})
        THEN 1 ELSE LEAST(bucket.attempt_count + 1, ${limit + 1}) END,
      blocked_until = CASE
        WHEN bucket.window_started_at <= (statement_timestamp() AT TIME ZONE 'UTC') - make_interval(secs => ${WINDOW_SECONDS})
        THEN NULL
        WHEN bucket.attempt_count >= ${limit}
        THEN bucket.window_started_at + make_interval(secs => ${WINDOW_SECONDS}) ELSE NULL END,
      updated_at = statement_timestamp() AT TIME ZONE 'UTC'
    RETURNING attempt_count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM
      (window_started_at + make_interval(secs => ${WINDOW_SECONDS}) - (statement_timestamp() AT TIME ZONE 'UTC')))))::integer AS retry_after
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Pairing rate limit returned no counter");
  return { allowed: row.attempt_count <= limit, retryAfter: row.retry_after };
}

export async function allowPairingAttempt(
  req: Request,
  res: Response,
  scope: "confirm" | "confirm_code" | "generate",
  parentId?: string,
): Promise<boolean> {
  // req.ip respeita apenas os proxies explicitamente configurados no Express.
  // Nunca ler X-Forwarded-For diretamente: o cliente pode falsificar esse header.
  const source = parentId ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
  const result = await consumePairingAttempt(
    pairingSourceHash(scope, source),
    scope === "confirm_code" ? 5 : scope === "confirm" ? 30 : 20,
  );
  if (result.allowed) return true;
  res.setHeader("Retry-After", String(result.retryAfter));
  res.status(429).json({ error: "pairing_rate_limited", retryAfter: result.retryAfter });
  return false;
}
