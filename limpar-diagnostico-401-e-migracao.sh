#!/usr/bin/env bash
set -euo pipefail

# O 401 no pareamento ja foi resolvido e a migracao das tabelas de
# localizacao ja rodou com sucesso. Este script remove o log temporario de
# diagnostico e a rota temporaria de migracao, que nao sao mais necessarios
# (mesmo padrao usado depois de resolver o 401/500 originais).
#
# Rode a partir de ~/Desktop/monitora_pai:
#   bash limpar-diagnostico-401-e-migracao.sh

if [ ! -d ".git" ]; then
  echo "Erro: rode este script de dentro da pasta do repositorio (ex: ~/Desktop/monitora_pai)."
  exit 1
fi

echo "==> Atualizando repositorio local (git pull)..."
git pull

echo "==> Aplicando patch de limpeza..."
PATCH_FILE="$(mktemp)"
cat > "$PATCH_FILE" <<'PATCH_EOF'
diff --git a/artifacts/api-server/src/routes/index.ts b/artifacts/api-server/src/routes/index.ts
index e3ea420..fc448a3 100644
--- a/artifacts/api-server/src/routes/index.ts
+++ b/artifacts/api-server/src/routes/index.ts
@@ -4,7 +4,6 @@ import pairingRouter from "./pairing";
 import contactsRouter from "./contacts";
 import messagesRouter from "./messages";
 import locationRouter from "./location";
-import migrateLocationRouter from "./migrateLocation";
 
 const router: IRouter = Router();
 
@@ -13,6 +12,5 @@ router.use(pairingRouter);
 router.use(contactsRouter);
 router.use(messagesRouter);
 router.use(locationRouter);
-router.use(migrateLocationRouter);
 
 export default router;
diff --git a/artifacts/api-server/src/routes/migrateLocation.ts b/artifacts/api-server/src/routes/migrateLocation.ts
deleted file mode 100644
index b3dcfae..0000000
--- a/artifacts/api-server/src/routes/migrateLocation.ts
+++ /dev/null
@@ -1,55 +0,0 @@
-import { Router, type IRouter } from "express";
-import { sql } from "drizzle-orm";
-import { db } from "@workspace/db";
-
-const router: IRouter = Router();
-
-/**
- * ROTA TEMPORÁRIA — cria as tabelas do recurso de localização real
- * (child_device_tokens, locations). Só existe porque o banco no Railway
- * não tem proxy TCP público (drizzle-kit push não roda daqui de fora).
- *
- * Seguro rodar mais de uma vez: usa CREATE TABLE IF NOT EXISTS, não apaga
- * nem altera nada que já existe. Depois de confirmado que funcionou, este
- * arquivo deve ser removido (mesmo padrão usado em clerkDebug.ts /
- * dbReset.ts, que já foram removidos depois de resolvidos os erros de
- * autenticação).
- */
-router.get("/__debug/migrate-location", async (req, res) => {
-  if (req.query.confirm !== "CRIAR") {
-    return res.status(400).json({
-      error: "confirmation_required",
-      message: "Adicione ?confirm=CRIAR na URL para criar as tabelas de localização.",
-    });
-  }
-
-  try {
-    await db.execute(sql`
-      CREATE TABLE IF NOT EXISTS "child_device_tokens" (
-        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
-        "child_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
-        "token_hash" text NOT NULL UNIQUE,
-        "created_at" timestamp NOT NULL DEFAULT now(),
-        "last_used_at" timestamp
-      )
-    `);
-
-    await db.execute(sql`
-      CREATE TABLE IF NOT EXISTS "locations" (
-        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
-        "child_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
-        "latitude" double precision NOT NULL,
-        "longitude" double precision NOT NULL,
-        "accuracy_meters" double precision,
-        "recorded_at" timestamp NOT NULL DEFAULT now()
-      )
-    `);
-
-    return res.status(200).json({ ok: true, message: "Tabelas de localização prontas." });
-  } catch (err) {
-    const e = err as { message?: string; cause?: { message?: string } };
-    return res.status(500).json({ error: "migration_failed", message: e?.cause?.message ?? e?.message });
-  }
-});
-
-export default router;
diff --git a/artifacts/api-server/src/routes/pairing.ts b/artifacts/api-server/src/routes/pairing.ts
index 478a163..c856a70 100644
--- a/artifacts/api-server/src/routes/pairing.ts
+++ b/artifacts/api-server/src/routes/pairing.ts
@@ -4,7 +4,6 @@ import { randomBytes, randomUUID, createHash } from "crypto";
 import { eq, and, isNull, gt } from "drizzle-orm";
 import { db, pairingTokensTable, usersTable, childDeviceTokensTable } from "@workspace/db";
 import { z } from "zod/v4";
-import { logger } from "../lib/logger";
 
 const router: IRouter = Router();
 
@@ -30,16 +29,6 @@ const createPairingSchema = z.object({
 router.post("/pairing", async (req, res) => {
   const auth = getAuth(req);
   if (!auth.userId) {
-    // DIAGNÓSTICO TEMPORÁRIO — mesmo padrão usado pra achar a causa do 401
-    // original (chave do Clerk inválida). Loga o motivo real do Clerk ter
-    // rejeitado a requisição, sem expor isso na resposta HTTP. Remover
-    // depois de identificar a causa.
-    try {
-      const debugInfo = auth.debug();
-      logger.warn({ pairingAuthDebug: debugInfo, origin: req.headers.origin, hasAuthHeader: Boolean(req.headers.authorization) }, "pairing_not_authenticated_debug");
-    } catch (debugErr) {
-      logger.warn({ debugErr }, "pairing_not_authenticated_debug_failed");
-    }
     return res.status(401).json({ error: "not_authenticated" });
   }
 
PATCH_EOF

git apply "$PATCH_FILE"
rm -f "$PATCH_FILE"

echo "==> Adicionando arquivos..."
git add -A -- \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/migrateLocation.ts \
  artifacts/api-server/src/routes/pairing.ts

echo "==> Criando commit..."
git commit -m "$(cat <<'COMMIT_EOF'
Remove log de diagnostico do 401 e rota temporaria de migracao (ja resolvidos)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gjMny7NXXrbAnQF6p1Ba6
COMMIT_EOF
)"

echo "==> Enviando pro GitHub (git push)..."
git push

echo ""
echo "=================================================================="
echo "Pronto! O app continua funcionando exatamente igual - so removemos"
echo "codigo temporario que ja tinha cumprido o papel dele."
echo "=================================================================="
