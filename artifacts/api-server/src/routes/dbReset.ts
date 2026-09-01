import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const TABLES = [
  "mirror_log",
  "messages",
  "conversations",
  "contacts",
  "pairing_tokens",
  "subscriptions",
  "users",
] as const;

/**
 * DIAGNÓSTICO/MIGRAÇÃO TEMPORÁRIA — corrige o schema depois do bug de
 * usersTable.id ser `uuid` quando na verdade precisa ser `text` (pra
 * conseguir guardar o Clerk userId do Responsável, ex: "user_3Ij4...").
 * Ver schema/users.ts pro comentário completo.
 *
 * Como NENHUM insert em `users` nunca teve sucesso (o 401 do Clerk bloqueou
 * tudo até agora, e depois disso o 500 do tipo uuid bloqueou o resto), todas
 * as 7 tabelas estão garantidamente vazias — então dropar e recriar com o
 * schema correto não perde dado nenhum. Ainda assim, checamos antes e
 * abortamos se acharmos qualquer linha, por segurança.
 *
 * GET /api/__debug/reset-schema?confirm=RESETAR
 * Remover esta rota (e o botão de nao terminar precisando dela de novo)
 * depois de confirmar que /api/pairing funciona.
 */
router.get("/__debug/reset-schema", async (req, res) => {
  if (req.query.confirm !== "RESETAR") {
    return res.status(400).json({
      error: "missing_confirmation",
      hint: "Chame com ?confirm=RESETAR pra executar.",
    });
  }

  const client = await pool.connect();
  try {
    // 1) Verifica se as tabelas existem e, se existirem, se estão vazias.
    const counts: Record<string, number | "not_found"> = {};
    for (const table of TABLES) {
      try {
        const result = await client.query(
          `SELECT count(*)::int AS count FROM "${table}"`,
        );
        counts[table] = result.rows[0].count;
      } catch {
        counts[table] = "not_found";
      }
    }

    const nonEmpty = Object.entries(counts).filter(
      ([, count]) => typeof count === "number" && count > 0,
    );
    if (nonEmpty.length > 0) {
      return res.status(409).json({
        error: "tables_not_empty",
        counts,
        hint: "Existem linhas em produção — não vou dropar nada automaticamente.",
      });
    }

    // 2) Dropa tudo (tabelas primeiro, CASCADE cuida das FKs; depois os enums).
    await client.query("BEGIN");
    await client.query(
      `DROP TABLE IF EXISTS ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
    );
    await client.query(`
      DROP TYPE IF EXISTS user_role CASCADE;
      DROP TYPE IF EXISTS auth_provider CASCADE;
      DROP TYPE IF EXISTS contact_status CASCADE;
      DROP TYPE IF EXISTS message_type CASCADE;
      DROP TYPE IF EXISTS plan CASCADE;
      DROP TYPE IF EXISTS subscription_status CASCADE;
    `);

    // 3) Recria tudo já com usersTable.id como TEXT (e toda FK que aponta
    // pra ele, também TEXT) — espelha exatamente lib/db/src/schema/*.ts.
    await client.query(`
      CREATE TYPE user_role AS ENUM ('parent', 'child');
      CREATE TYPE auth_provider AS ENUM ('email', 'google', 'apple');
      CREATE TYPE contact_status AS ENUM ('pending', 'approved', 'denied', 'revoked');
      CREATE TYPE message_type AS ENUM ('text', 'audio', 'video', 'photo');
      CREATE TYPE plan AS ENUM ('free', 'paid');
      CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled');

      CREATE TABLE users (
        id text PRIMARY KEY,
        role user_role NOT NULL,
        name text NOT NULL,
        phone text,
        email text UNIQUE,
        auth_provider auth_provider,
        parent_id text,
        onboarding_completed text DEFAULT 'false',
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE pairing_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        token text NOT NULL UNIQUE,
        parent_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        child_name text NOT NULL,
        child_age text,
        expires_at timestamp NOT NULL,
        used_at timestamp,
        resulting_child_user_id text REFERENCES users(id),
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        child_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        contact_user_id text REFERENCES users(id),
        contact_name text NOT NULL,
        contact_phone text,
        status contact_status NOT NULL DEFAULT 'pending',
        restrictions jsonb,
        requested_at timestamp NOT NULL DEFAULT now(),
        decided_at timestamp
      );

      CREATE TABLE conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        participant_a_id text NOT NULL REFERENCES users(id),
        participant_b_id text NOT NULL REFERENCES users(id),
        is_parent_child_private boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id text NOT NULL REFERENCES users(id),
        type message_type NOT NULL,
        content_url text,
        text_content text,
        created_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE mirror_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        mirrored_to_parent_id text NOT NULL REFERENCES users(id),
        mirrored_at timestamp NOT NULL DEFAULT now()
      );

      CREATE TABLE subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        parent_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan plan NOT NULL DEFAULT 'free',
        status subscription_status NOT NULL DEFAULT 'active',
        children_limit integer NOT NULL DEFAULT 1,
        current_period_end timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      );
    `);
    await client.query("COMMIT");

    logger.info({ previousCounts: counts }, "db_reset_schema_done");
    return res.status(200).json({ ok: true, previousCounts: counts });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const e = err as { message?: string };
    logger.error({ err }, "db_reset_schema_failed");
    return res.status(500).json({ ok: false, error: e?.message ?? String(err) });
  } finally {
    client.release();
  }
});

export default router;
