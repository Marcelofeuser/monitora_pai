import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const router: IRouter = Router();

// Rota de migração TEMPORÁRIA — mesmo padrão já usado nas fases
// anteriores (o Postgres do Railway não tem proxy TCP público, então
// `drizzle-kit push` não roda de fora). Ajusta o schema pro relacionamento
// do Responsável (pai/mãe/avó/tio, pedido do Marcelo — ver
// lib/db/src/schema/users.ts). `CREATE TYPE` não tem "IF NOT EXISTS" no
// Postgres, por isso o bloco DO $$ ... EXCEPTION captura "já existe" e
// segue. Seguro rodar mais de uma vez. Deletar esta rota (e o registro em
// routes/index.ts) num commit seguinte depois de confirmar que rodou.
const STATEMENTS: string[] = [
  `DO $$ BEGIN
     CREATE TYPE "parent_relationship" AS ENUM ('pai', 'mae', 'avo_m', 'avo_f', 'tio', 'tia', 'responsavel');
   EXCEPTION
     WHEN duplicate_object THEN null;
   END $$;`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "relationship" "parent_relationship"`,
];

router.get("/__debug/migrate-relationship", async (_req, res) => {
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
