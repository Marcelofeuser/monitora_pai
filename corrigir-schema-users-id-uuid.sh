#!/bin/bash
set -e

if [ ! -d ".git" ]; then
  echo "ERRO: rode este script DE DENTRO da pasta monitora_pai (onde tem uma pasta .git)."
  exit 1
fi

echo "==> Atualizando com o GitHub..."
git pull origin main

echo "==> Escrevendo o patch..."
cat > /tmp/corrigir-schema.patch << 'PATCH_EOF_MARKER_7fa21'
diff --git a/artifacts/api-server/src/app.ts b/artifacts/api-server/src/app.ts
index 8618881..e14e1a2 100644
--- a/artifacts/api-server/src/app.ts
+++ b/artifacts/api-server/src/app.ts
@@ -90,4 +90,29 @@ app.use((req, _res, next) => {

 app.use("/api", router);

+// Handler de erro global: sem isso, um erro não tratado numa rota async
+// (ex: uma query do Drizzle que falha) só aparecia nos logs como um
+// stack trace cru do finalhandler do Express — sem contexto estruturado,
+// sem err.cause (onde o driver do Postgres bota a mensagem real, tipo
+// "invalid input syntax for type uuid"), e o cliente só via um 500 vazio.
+// eslint-disable-next-line @typescript-eslint/no-unused-vars
+app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
+  const e = err as { message?: string; cause?: { message?: string; code?: string }; stack?: string };
+  logger.error(
+    {
+      err: {
+        message: e?.message,
+        causeMessage: e?.cause?.message,
+        causeCode: e?.cause?.code,
+        stack: e?.stack,
+      },
+      path: req.path,
+      method: req.method,
+    },
+    "unhandled_request_error",
+  );
+  if (res.headersSent) return;
+  res.status(500).json({ error: "internal_error" });
+});
+
 export default app;
diff --git a/artifacts/api-server/src/routes/dbReset.ts b/artifacts/api-server/src/routes/dbReset.ts
new file mode 100644
index 0000000..233c3d3
--- /dev/null
+++ b/artifacts/api-server/src/routes/dbReset.ts
@@ -0,0 +1,176 @@
+import { Router, type IRouter } from "express";
+import { pool } from "@workspace/db";
+import { logger } from "../lib/logger";
+
+const router: IRouter = Router();
+
+const TABLES = [
+  "mirror_log",
+  "messages",
+  "conversations",
+  "contacts",
+  "pairing_tokens",
+  "subscriptions",
+  "users",
+] as const;
+
+/**
+ * DIAGNÓSTICO/MIGRAÇÃO TEMPORÁRIA — corrige o schema depois do bug de
+ * usersTable.id ser `uuid` quando na verdade precisa ser `text` (pra
+ * conseguir guardar o Clerk userId do Responsável, ex: "user_3Ij4...").
+ * Ver schema/users.ts pro comentário completo.
+ *
+ * Como NENHUM insert em `users` nunca teve sucesso (o 401 do Clerk bloqueou
+ * tudo até agora, e depois disso o 500 do tipo uuid bloqueou o resto), todas
+ * as 7 tabelas estão garantidamente vazias — então dropar e recriar com o
+ * schema correto não perde dado nenhum. Ainda assim, checamos antes e
+ * abortamos se acharmos qualquer linha, por segurança.
+ *
+ * GET /api/__debug/reset-schema?confirm=RESETAR
+ * Remover esta rota (e o botão de nao terminar precisando dela de novo)
+ * depois de confirmar que /api/pairing funciona.
+ */
+router.get("/__debug/reset-schema", async (req, res) => {
+  if (req.query.confirm !== "RESETAR") {
+    return res.status(400).json({
+      error: "missing_confirmation",
+      hint: "Chame com ?confirm=RESETAR pra executar.",
+    });
+  }
+
+  const client = await pool.connect();
+  try {
+    // 1) Verifica se as tabelas existem e, se existirem, se estão vazias.
+    const counts: Record<string, number | "not_found"> = {};
+    for (const table of TABLES) {
+      try {
+        const result = await client.query(
+          `SELECT count(*)::int AS count FROM "${table}"`,
+        );
+        counts[table] = result.rows[0].count;
+      } catch {
+        counts[table] = "not_found";
+      }
+    }
+
+    const nonEmpty = Object.entries(counts).filter(
+      ([, count]) => typeof count === "number" && count > 0,
+    );
+    if (nonEmpty.length > 0) {
+      return res.status(409).json({
+        error: "tables_not_empty",
+        counts,
+        hint: "Existem linhas em produção — não vou dropar nada automaticamente.",
+      });
+    }
+
+    // 2) Dropa tudo (tabelas primeiro, CASCADE cuida das FKs; depois os enums).
+    await client.query("BEGIN");
+    await client.query(
+      `DROP TABLE IF EXISTS ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
+    );
+    await client.query(`
+      DROP TYPE IF EXISTS user_role CASCADE;
+      DROP TYPE IF EXISTS auth_provider CASCADE;
+      DROP TYPE IF EXISTS contact_status CASCADE;
+      DROP TYPE IF EXISTS message_type CASCADE;
+      DROP TYPE IF EXISTS plan CASCADE;
+      DROP TYPE IF EXISTS subscription_status CASCADE;
+    `);
+
+    // 3) Recria tudo já com usersTable.id como TEXT (e toda FK que aponta
+    // pra ele, também TEXT) — espelha exatamente lib/db/src/schema/*.ts.
+    await client.query(`
+      CREATE TYPE user_role AS ENUM ('parent', 'child');
+      CREATE TYPE auth_provider AS ENUM ('email', 'google', 'apple');
+      CREATE TYPE contact_status AS ENUM ('pending', 'approved', 'denied', 'revoked');
+      CREATE TYPE message_type AS ENUM ('text', 'audio', 'video', 'photo');
+      CREATE TYPE plan AS ENUM ('free', 'paid');
+      CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled');
+
+      CREATE TABLE users (
+        id text PRIMARY KEY,
+        role user_role NOT NULL,
+        name text NOT NULL,
+        phone text,
+        email text UNIQUE,
+        auth_provider auth_provider,
+        parent_id text,
+        onboarding_completed text DEFAULT 'false',
+        created_at timestamp NOT NULL DEFAULT now()
+      );
+
+      CREATE TABLE pairing_tokens (
+        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+        token text NOT NULL UNIQUE,
+        parent_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
+        child_name text NOT NULL,
+        child_age text,
+        expires_at timestamp NOT NULL,
+        used_at timestamp,
+        resulting_child_user_id text REFERENCES users(id),
+        created_at timestamp NOT NULL DEFAULT now()
+      );
+
+      CREATE TABLE contacts (
+        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+        child_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
+        contact_user_id text REFERENCES users(id),
+        contact_name text NOT NULL,
+        contact_phone text,
+        status contact_status NOT NULL DEFAULT 'pending',
+        restrictions jsonb,
+        requested_at timestamp NOT NULL DEFAULT now(),
+        decided_at timestamp
+      );
+
+      CREATE TABLE conversations (
+        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+        participant_a_id text NOT NULL REFERENCES users(id),
+        participant_b_id text NOT NULL REFERENCES users(id),
+        is_parent_child_private boolean NOT NULL DEFAULT false,
+        created_at timestamp NOT NULL DEFAULT now()
+      );
+
+      CREATE TABLE messages (
+        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
+        sender_id text NOT NULL REFERENCES users(id),
+        type message_type NOT NULL,
+        content_url text,
+        text_content text,
+        created_at timestamp NOT NULL DEFAULT now()
+      );
+
+      CREATE TABLE mirror_log (
+        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
+        mirrored_to_parent_id text NOT NULL REFERENCES users(id),
+        mirrored_at timestamp NOT NULL DEFAULT now()
+      );
+
+      CREATE TABLE subscriptions (
+        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+        parent_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
+        plan plan NOT NULL DEFAULT 'free',
+        status subscription_status NOT NULL DEFAULT 'active',
+        children_limit integer NOT NULL DEFAULT 1,
+        current_period_end timestamp,
+        created_at timestamp NOT NULL DEFAULT now()
+      );
+    `);
+    await client.query("COMMIT");
+
+    logger.info({ previousCounts: counts }, "db_reset_schema_done");
+    return res.status(200).json({ ok: true, previousCounts: counts });
+  } catch (err) {
+    await client.query("ROLLBACK").catch(() => {});
+    const e = err as { message?: string };
+    logger.error({ err }, "db_reset_schema_failed");
+    return res.status(500).json({ ok: false, error: e?.message ?? String(err) });
+  } finally {
+    client.release();
+  }
+});
+
+export default router;
diff --git a/artifacts/api-server/src/routes/index.ts b/artifacts/api-server/src/routes/index.ts
index e2aff83..d631b18 100644
--- a/artifacts/api-server/src/routes/index.ts
+++ b/artifacts/api-server/src/routes/index.ts
@@ -4,6 +4,7 @@ import pairingRouter from "./pairing";
 import contactsRouter from "./contacts";
 import messagesRouter from "./messages";
 import clerkDebugRouter from "./clerkDebug";
+import dbResetRouter from "./dbReset";

 const router: IRouter = Router();

@@ -11,8 +12,9 @@ router.use(healthRouter);
 router.use(pairingRouter);
 router.use(contactsRouter);
 router.use(messagesRouter);
-// DIAGNÓSTICO TEMPORÁRIO — remover junto com src/routes/clerkDebug.ts depois
-// de resolver o 401 not_authenticated.
+// DIAGNÓSTICO/MIGRAÇÃO TEMPORÁRIA — remover junto com src/routes/clerkDebug.ts
+// e src/routes/dbReset.ts depois de confirmar que /api/pairing funciona.
 router.use(clerkDebugRouter);
+router.use(dbResetRouter);

 export default router;
diff --git a/artifacts/api-server/src/routes/pairing.ts b/artifacts/api-server/src/routes/pairing.ts
index e070a64..19d8906 100644
--- a/artifacts/api-server/src/routes/pairing.ts
+++ b/artifacts/api-server/src/routes/pairing.ts
@@ -1,6 +1,6 @@
 import { Router, type IRouter } from "express";
 import { getAuth } from "@clerk/express";
-import { randomBytes } from "crypto";
+import { randomBytes, randomUUID } from "crypto";
 import { eq, and, isNull, gt } from "drizzle-orm";
 import { db, pairingTokensTable, usersTable } from "@workspace/db";
 import { z } from "zod/v4";
@@ -105,6 +105,10 @@ router.post("/pairing/confirm", async (req, res) => {
   const [childUser] = await db
     .insert(usersTable)
     .values({
+      // usersTable.id agora é TEXT (sem default no banco — ver
+      // schema/users.ts), porque pra role='parent' o id precisa ser
+      // exatamente o Clerk userId. Pra role='child' geramos o id aqui.
+      id: randomUUID(),
       role: "child",
       name: pairing.childName,
       parentId: pairing.parentId,
diff --git a/lib/db/src/schema/contacts.ts b/lib/db/src/schema/contacts.ts
index ce41dc4..2aadfa8 100644
--- a/lib/db/src/schema/contacts.ts
+++ b/lib/db/src/schema/contacts.ts
@@ -14,10 +14,11 @@ export const contactStatusEnum = pgEnum("contact_status", [
 // Regra crítica: billing NUNCA consulta esta tabela — ver subscriptions.ts.
 export const contactsTable = pgTable("contacts", {
   id: uuid("id").primaryKey().defaultRandom(),
-  childId: uuid("child_id")
+  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
+  childId: text("child_id")
     .notNull()
     .references(() => usersTable.id, { onDelete: "cascade" }),
-  contactUserId: uuid("contact_user_id").references(() => usersTable.id),
+  contactUserId: text("contact_user_id").references(() => usersTable.id),
   contactName: text("contact_name").notNull(),
   contactPhone: text("contact_phone"),
   status: contactStatusEnum("status").notNull().default("pending"),
diff --git a/lib/db/src/schema/messages.ts b/lib/db/src/schema/messages.ts
index f8083f4..4ef5c10 100644
--- a/lib/db/src/schema/messages.ts
+++ b/lib/db/src/schema/messages.ts
@@ -7,10 +7,11 @@ export const messageTypeEnum = pgEnum("message_type", ["text", "audio", "video",

 export const conversationsTable = pgTable("conversations", {
   id: uuid("id").primaryKey().defaultRandom(),
-  participantAId: uuid("participant_a_id")
+  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
+  participantAId: text("participant_a_id")
     .notNull()
     .references(() => usersTable.id),
-  participantBId: uuid("participant_b_id")
+  participantBId: text("participant_b_id")
     .notNull()
     .references(() => usersTable.id),
   // Regra central do produto: só é espelhada se NÃO for a conversa
@@ -24,7 +25,8 @@ export const messagesTable = pgTable("messages", {
   conversationId: uuid("conversation_id")
     .notNull()
     .references(() => conversationsTable.id, { onDelete: "cascade" }),
-  senderId: uuid("sender_id")
+  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
+  senderId: text("sender_id")
     .notNull()
     .references(() => usersTable.id),
   type: messageTypeEnum("type").notNull(),
@@ -39,7 +41,8 @@ export const mirrorLogTable = pgTable("mirror_log", {
   messageId: uuid("message_id")
     .notNull()
     .references(() => messagesTable.id, { onDelete: "cascade" }),
-  mirroredToParentId: uuid("mirrored_to_parent_id")
+  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
+  mirroredToParentId: text("mirrored_to_parent_id")
     .notNull()
     .references(() => usersTable.id),
   mirroredAt: timestamp("mirrored_at").defaultNow().notNull(),
diff --git a/lib/db/src/schema/pairing.ts b/lib/db/src/schema/pairing.ts
index fbf8b33..4b978b1 100644
--- a/lib/db/src/schema/pairing.ts
+++ b/lib/db/src/schema/pairing.ts
@@ -9,7 +9,9 @@ import { usersTable } from "./users";
 export const pairingTokensTable = pgTable("pairing_tokens", {
   id: uuid("id").primaryKey().defaultRandom(),
   token: text("token").notNull().unique(),
-  parentId: uuid("parent_id")
+  // TEXT: referencia usersTable.id, que agora é text (Clerk userId pro
+  // Responsável). Ver comentário em schema/users.ts.
+  parentId: text("parent_id")
     .notNull()
     .references(() => usersTable.id, { onDelete: "cascade" }),
   childName: text("child_name").notNull(),
@@ -17,7 +19,7 @@ export const pairingTokensTable = pgTable("pairing_tokens", {
   expiresAt: timestamp("expires_at").notNull(),
   usedAt: timestamp("used_at"),
   // Preenchido depois que a Criança escaneia e confirma o vínculo.
-  resultingChildUserId: uuid("resulting_child_user_id").references(() => usersTable.id),
+  resultingChildUserId: text("resulting_child_user_id").references(() => usersTable.id),
   createdAt: timestamp("created_at").defaultNow().notNull(),
 });

diff --git a/lib/db/src/schema/subscriptions.ts b/lib/db/src/schema/subscriptions.ts
index d3bb5b6..7a53228 100644
--- a/lib/db/src/schema/subscriptions.ts
+++ b/lib/db/src/schema/subscriptions.ts
@@ -17,7 +17,8 @@ export const subscriptionStatusEnum = pgEnum("subscription_status", [
 // a tabela contacts ou conversations.
 export const subscriptionsTable = pgTable("subscriptions", {
   id: uuid("id").primaryKey().defaultRandom(),
-  parentUserId: uuid("parent_user_id")
+  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
+  parentUserId: text("parent_user_id")
     .notNull()
     .references(() => usersTable.id, { onDelete: "cascade" }),
   plan: planEnum("plan").notNull().default("free"),
diff --git a/lib/db/src/schema/users.ts b/lib/db/src/schema/users.ts
index 08651de..03737b4 100644
--- a/lib/db/src/schema/users.ts
+++ b/lib/db/src/schema/users.ts
@@ -1,4 +1,4 @@
-import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
+import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
 import { createInsertSchema } from "drizzle-zod";
 import { z } from "zod/v4";

@@ -6,7 +6,14 @@ export const userRoleEnum = pgEnum("user_role", ["parent", "child"]);
 export const authProviderEnum = pgEnum("auth_provider", ["email", "google", "apple"]);

 export const usersTable = pgTable("users", {
-  id: uuid("id").primaryKey().defaultRandom(),
+  // TEXT, não uuid: para role='parent' este id É o Clerk userId (ex.:
+  // "user_3Ij4IMDV8TvM0BHZI6VVg9Zldeu") — o Responsável nunca tem uma conta
+  // interna separada da conta Clerk. Para role='child' o id é gerado pela
+  // aplicação (crypto.randomUUID(), ver routes/pairing.ts) já que a Criança
+  // não tem Clerk. Colocar isso como `uuid` quebrava todo insert de
+  // Responsável (Postgres rejeitava o userId do Clerk com "invalid input
+  // syntax for type uuid").
+  id: text("id").primaryKey(),
   role: userRoleEnum("role").notNull(),
   name: text("name").notNull(),
   // Nullable de propósito: a conta da Criança nunca depende de telefone/SIM.
@@ -15,7 +22,7 @@ export const usersTable = pgTable("users", {
   email: text("email").unique(),
   authProvider: authProviderEnum("auth_provider"),
   // Aponta para o Responsável quando role = 'child'. Nulo para Responsáveis.
-  parentId: uuid("parent_id"),
+  parentId: text("parent_id"),
   onboardingCompleted: text("onboarding_completed").default("false"),
   createdAt: timestamp("created_at").defaultNow().notNull(),
 });
PATCH_EOF_MARKER_7fa21

echo "==> Aplicando as mudancas..."
git apply /tmp/corrigir-schema.patch

echo "==> Commitando..."
git add -A
git commit -m "Corrige usersTable.id de uuid pra text (guardar Clerk userId), adiciona handler de erro global e rota temporaria de reset de schema"

echo "==> Enviando pro GitHub..."
git push origin main

echo ""
echo "==> PRONTO. O Railway vai detectar e buildar sozinho em instantes (1-2 min)."
echo "==> Depois do deploy, NAO precisa fazer nada no navegador ainda —"
echo "    eu mesmo vou disparar a migracao do banco (rota temporaria de reset"
echo "    de schema) e testar. Só te aviso quando estiver tudo certo pra"
echo "    voce testar o /pair de novo."
