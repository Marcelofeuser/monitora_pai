import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

/**
 * ROTA TEMPORÁRIA — cria as tabelas do recurso de localização real
 * (child_device_tokens, locations). Só existe porque o banco no Railway
 * não tem proxy TCP público (drizzle-kit push não roda daqui de fora).
 *
 * Seguro rodar mais de uma vez: usa CREATE TABLE IF NOT EXISTS, não apaga
 * nem altera nada que já existe. Depois de confirmado que funcionou, este
 * arquivo deve ser removido (mesmo padrão usado em clerkDebug.ts /
 * dbReset.ts, que já foram removidos depois de resolvidos os erros de
 * autenticação).
 */
router.get("/__debug/migrate-location", async (req, res) => {
  if (req.query.confirm !== "CRIAR") {
    return res.status(400).json({
      error: "confirmation_required",
      message: "Adicione ?confirm=CRIAR na URL para criar as tabelas de localização.",
    });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "child_device_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "child_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" text NOT NULL UNIQUE,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "last_used_at" timestamp
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "locations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "child_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "latitude" double precision NOT NULL,
        "longitude" double precision NOT NULL,
        "accuracy_meters" double precision,
        "recorded_at" timestamp NOT NULL DEFAULT now()
      )
    `);

    return res.status(200).json({ ok: true, message: "Tabelas de localização prontas." });
  } catch (err) {
    const e = err as { message?: string; cause?: { message?: string } };
    return res.status(500).json({ error: "migration_failed", message: e?.cause?.message ?? e?.message });
  }
});

export default router;
