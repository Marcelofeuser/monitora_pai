#!/bin/bash
set -e

if [ ! -d ".git" ]; then
  echo "ERRO: rode este script DE DENTRO da pasta monitora_pai (onde tem uma pasta .git)."
  exit 1
fi

echo "==> Atualizando com o GitHub..."
git pull origin main

echo "==> Escrevendo o patch..."
cat > /tmp/debug-auth.patch << 'PATCH_EOF_MARKER_3a7f2'
diff --git a/artifacts/api-server/src/app.ts b/artifacts/api-server/src/app.ts
index 43acf73..a542b12 100644
--- a/artifacts/api-server/src/app.ts
+++ b/artifacts/api-server/src/app.ts
@@ -1,7 +1,7 @@
 import express, { type Express } from "express";
 import cors from "cors";
 import pinoHttp from "pino-http";
-import { clerkMiddleware } from "@clerk/express";
+import { clerkMiddleware, getAuth } from "@clerk/express";
 import router from "./routes";
 import { logger } from "./lib/logger";
 import {
@@ -47,6 +47,27 @@ app.use(
   }),
 );
 
+// DIAGNÓSTICO TEMPORÁRIO: loga por que a autenticação está falhando.
+// Remover depois de descobrir a causa raiz do 401.
+app.use((req, _res, next) => {
+  if (req.path.startsWith("/api/pairing") || req.path.startsWith("/api/children")) {
+    const authHeader = req.headers.authorization;
+    const auth = getAuth(req);
+    logger.info(
+      {
+        hasAuthHeader: Boolean(authHeader),
+        authHeaderLength: authHeader?.length ?? 0,
+        authHeaderPrefix: authHeader?.slice(0, 20),
+        userId: auth?.userId ?? null,
+        authReason: (auth as { reason?: string })?.reason ?? null,
+        authMessage: (auth as { message?: string })?.message ?? null,
+      },
+      "clerk_auth_debug",
+    );
+  }
+  next();
+});
+
 app.use("/api", router);
 
 export default app;
PATCH_EOF_MARKER_3a7f2

echo "==> Aplicando as mudancas..."
git apply /tmp/debug-auth.patch

echo "==> Commitando..."
git add -A
git commit -m "Adiciona log de diagnostico temporario para 401 do Clerk"

echo "==> Enviando pro GitHub..."
git push origin main

echo ""
echo "==> PRONTO. O Railway vai detectar e buildar sozinho em instantes."
