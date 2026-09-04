#!/usr/bin/env bash
set -euo pipefail

# Adiciona um log temporario que mostra o motivo real do Clerk ter
# recusado a requisicao (o mesmo tipo de diagnostico usado antes pra achar
# a causa do 401 original). Nao muda nenhum comportamento visivel no app -
# so loga mais detalhe no Railway quando o erro "not_authenticated" acontecer.
#
# Rode a partir de ~/Desktop/monitora_pai:
#   bash diagnosticar-401-pairing.sh

if [ ! -d ".git" ]; then
  echo "Erro: rode este script de dentro da pasta do repositorio (ex: ~/Desktop/monitora_pai)."
  exit 1
fi

echo "==> Atualizando repositorio local (git pull)..."
git pull

echo "==> Aplicando patch de diagnostico..."
PATCH_FILE="$(mktemp)"
cat > "$PATCH_FILE" <<'PATCH_EOF'
diff --git a/artifacts/api-server/src/routes/pairing.ts b/artifacts/api-server/src/routes/pairing.ts
index c856a70..478a163 100644
--- a/artifacts/api-server/src/routes/pairing.ts
+++ b/artifacts/api-server/src/routes/pairing.ts
@@ -4,6 +4,7 @@ import { randomBytes, randomUUID, createHash } from "crypto";
 import { eq, and, isNull, gt } from "drizzle-orm";
 import { db, pairingTokensTable, usersTable, childDeviceTokensTable } from "@workspace/db";
 import { z } from "zod/v4";
+import { logger } from "../lib/logger";
 
 const router: IRouter = Router();
 
@@ -29,6 +30,16 @@ const createPairingSchema = z.object({
 router.post("/pairing", async (req, res) => {
   const auth = getAuth(req);
   if (!auth.userId) {
+    // DIAGNÓSTICO TEMPORÁRIO — mesmo padrão usado pra achar a causa do 401
+    // original (chave do Clerk inválida). Loga o motivo real do Clerk ter
+    // rejeitado a requisição, sem expor isso na resposta HTTP. Remover
+    // depois de identificar a causa.
+    try {
+      const debugInfo = auth.debug();
+      logger.warn({ pairingAuthDebug: debugInfo, origin: req.headers.origin, hasAuthHeader: Boolean(req.headers.authorization) }, "pairing_not_authenticated_debug");
+    } catch (debugErr) {
+      logger.warn({ debugErr }, "pairing_not_authenticated_debug_failed");
+    }
     return res.status(401).json({ error: "not_authenticated" });
   }
 
PATCH_EOF

git apply "$PATCH_FILE"
rm -f "$PATCH_FILE"

echo "==> Adicionando arquivo..."
git add -A -- artifacts/api-server/src/routes/pairing.ts

echo "==> Criando commit..."
git commit -m "$(cat <<'COMMIT_EOF'
Adiciona log temporario de diagnostico pro 401 not_authenticated em /api/pairing

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gjMny7NXXrbAnQF6p1Ba6
COMMIT_EOF
)"

echo "==> Enviando pro GitHub (git push)..."
git push

echo ""
echo "=================================================================="
echo "Pronto! Assim que o deploy do Railway terminar (uns 2-3 min),"
echo "tente gerar o QR code de novo na tela 'Vincular dispositivo da crianca'."
echo "Depois disso, me avise aqui no chat que eu confiro os logs do"
echo "Railway pra ver exatamente por que o Clerk recusou a requisicao."
echo "=================================================================="
