import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

// Rota de migração TEMPORÁRIA — mesmo padrão já usado nas fases
// anteriores (o Postgres do Railway não tem proxy TCP público, então
// `drizzle-kit push` não roda de fora). Ajusta o schema pra três coisas
// desta rodada: (1) push_subscriptions agora aceita assinatura da Criança
// também, não só do Responsável — parent_user_id vira opcional e ganha
// child_id; (2) conversations ganha uma coluna de debounce própria pra
// notificar a Criança. Seguro rodar mais de uma vez (DROP NOT NULL e ADD
// COLUMN IF NOT EXISTS não quebram se já tiver rodado). Deletar esta rota
// (e a linha que a registra em routes/index.ts) num commit seguinte
// depois de confirmar que rodou.
const STATEMENTS: string[] = [
  `ALTER TABLE "push_subscriptions" ALTER COLUMN "parent_user_id" DROP NOT NULL`,
  `ALTER TABLE "push_subscriptions" ADD COLUMN IF NOT EXISTS "child_id" text REFERENCES "users"("id") ON DELETE CASCADE`,
  `ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "last_notified_child_at" timestamp`,
  `ALTER TABLE "pairing_tokens" ADD COLUMN IF NOT EXISTS "reconnect_child_id" text REFERENCES "users"("id") ON DELETE CASCADE`,
];

router.get("/__debug/migrate-new-tables", async (_req, res) => {
  const results: Array<{ statement: string; ok: boolean; error?: string }> = [];
  for (const statement of STATEMENTS) {
    try {
      await db.execute(sql.raw(statement));
      results.push({ statement: statement.slice(0, 80), ok: true });
    } catch (err) {
      results.push({
        statement: statement.slice(0, 80),
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const allOk = results.every((r) => r.ok);
  return res.status(allOk ? 200 : 500).json({ allOk, results });
});

export default router;
