import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  db,
  pairingRateLimitsTable,
} from "@workspace/db";

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 10;
const BLOCK_MINUTES = 15;

export type PairingRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

function getSecret(): string {
  const secret = process.env.PAIRING_RATE_LIMIT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "PAIRING_RATE_LIMIT_SECRET precisa estar configurado com pelo menos 32 caracteres.",
    );
  }

  return secret;
}

/**
 * Registra uma tentativa de pareamento usando um identificador confiável
 * da origem. O identificador original não é persistido no PostgreSQL.
 *
 * O chamador deve fornecer uma origem obtida de uma fonte confiável,
 * nunca confiar cegamente em X-Forwarded-For.
 */
export async function recordPairingAttempt(
  sourceIdentifier: string,
): Promise<PairingRateLimitResult> {
  if (!sourceIdentifier.trim()) {
    throw new Error("Identificador da origem não informado.");
  }

  const now = new Date();
  const windowStartedAt = new Date(
    now.getTime() - WINDOW_MINUTES * 60_000,
  );
  const blockedUntil = new Date(
    now.getTime() + BLOCK_MINUTES * 60_000,
  );

  const sourceHash = createHmac("sha256", getSecret())
    .update(sourceIdentifier.trim())
    .digest("hex");

  const [row] = await db
    .insert(pairingRateLimitsTable)
    .values({
      id: sourceHash,
      sourceHash,
      windowStartedAt: now,
      attemptCount: 1,
      blockedUntil: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pairingRateLimitsTable.sourceHash,
      set: {
        windowStartedAt: sql`
          CASE
            WHEN ${pairingRateLimitsTable.windowStartedAt} <= ${windowStartedAt}
            THEN ${now}
            ELSE ${pairingRateLimitsTable.windowStartedAt}
          END
        `,
        attemptCount: sql`
          CASE
            WHEN ${pairingRateLimitsTable.windowStartedAt} <= ${windowStartedAt}
            THEN 1
            ELSE ${pairingRateLimitsTable.attemptCount} + 1
          END
        `,
        blockedUntil: sql`
          CASE
            WHEN ${pairingRateLimitsTable.blockedUntil} > ${now}
            THEN ${pairingRateLimitsTable.blockedUntil}
            WHEN ${pairingRateLimitsTable.windowStartedAt} <= ${windowStartedAt}
            THEN NULL
            WHEN ${pairingRateLimitsTable.attemptCount} + 1 >= ${MAX_ATTEMPTS}
            THEN ${blockedUntil}
            ELSE NULL
          END
        `,
        updatedAt: now,
      },
    })
    .returning({
      attemptCount: pairingRateLimitsTable.attemptCount,
      blockedUntil: pairingRateLimitsTable.blockedUntil,
    });

  if (!row) {
    throw new Error("Não foi possível registrar a tentativa de pareamento.");
  }

  if (row.blockedUntil && row.blockedUntil.getTime() > now.getTime()) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((row.blockedUntil.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  return {
    allowed: row.attemptCount < MAX_ATTEMPTS,
    retryAfterSeconds: 0,
  };
}
