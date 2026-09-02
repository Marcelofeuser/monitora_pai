import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

// Rota de migração TEMPORÁRIA — mesmo padrão já usado antes neste projeto
// (ver commits e55b53a/a9b74a2): o Postgres do Railway não tem proxy TCP
// público, então `drizzle-kit push` não roda de fora. Isso cria (com
// IF NOT EXISTS, seguro rodar mais de uma vez) as tabelas novas de três
// fases desta sessão — notificações, tempo de uso e grupos — de uma vez
// só, pra não precisar de uma rota de debug por fase. Deletar esta rota
// (e a linha que a registra em routes/index.ts) num commit seguinte
// depois de confirmar que rodou.
const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "parent_user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "endpoint" text NOT NULL UNIQUE,
    "p256dh" text NOT NULL,
    "auth" text NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_notified_at" timestamp`,
  `CREATE TABLE IF NOT EXISTS "screen_time_settings" (
    "child_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
    "daily_limit_minutes" integer,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "screen_time_usage" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "child_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "date" text NOT NULL,
    "minutes_used" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "screen_time_usage_child_date_unique" UNIQUE ("child_id", "date")
  )`,
  `CREATE TABLE IF NOT EXISTS "child_locks" (
    "child_id" text PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
    "locked_at" timestamp DEFAULT now() NOT NULL,
    "locked_by_parent_id" text NOT NULL REFERENCES "users"("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "groups" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "child_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "created_by_parent_id" text NOT NULL REFERENCES "users"("id"),
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "group_members" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "group_id" uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
    "contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
    "added_at" timestamp DEFAULT now() NOT NULL
  )`,
];

router.get("/__debug/migrate-new-tables", async (_req, res) => {
  const results: Array<{ statement: string; ok: boolean; error?: string }> = [];
  for (const statement of STATEMENTS) {
    try {
      await db.execute(sql.raw(statement));
      results.push({ statement: statement.slice(0, 60), ok: true });
    } catch (err) {
      results.push({
        statement: statement.slice(0, 60),
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const allOk = results.every((r) => r.ok);
  return res.status(allOk ? 200 : 500).json({ allOk, results });
});

export default router;
