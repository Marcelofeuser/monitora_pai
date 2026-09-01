#!/bin/bash
set -e

if [ ! -d ".git" ]; then
  echo "ERRO: rode este script DE DENTRO da pasta monitora_pai (onde tem uma pasta .git)."
  exit 1
fi

echo "==> Atualizando com o GitHub..."
git pull origin main

echo "==> Escrevendo o patch..."
cat > /tmp/corrigir-auth-clerk.patch << 'PATCH_EOF_MARKER_7c3d1'
diff --git a/artifacts/api-server/src/app.ts b/artifacts/api-server/src/app.ts
index 62b2ae4..80f7d23 100644
--- a/artifacts/api-server/src/app.ts
+++ b/artifacts/api-server/src/app.ts
@@ -2,13 +2,11 @@ import express, { type Express } from "express";
 import cors from "cors";
 import pinoHttp from "pino-http";
 import { clerkMiddleware } from "@clerk/express";
-import { publishableKeyFromHost } from "@clerk/shared/keys";
 import router from "./routes";
 import { logger } from "./lib/logger";
 import {
   CLERK_PROXY_PATH,
   clerkProxyMiddleware,
-  getClerkProxyHost,
 } from "./middlewares/clerkProxyMiddleware";
 
 const app: Express = express();
@@ -37,12 +35,10 @@ app.use(cors({ credentials: true, origin: true }));
 app.use(express.json());
 app.use(express.urlencoded({ extended: true }));
 app.use(
-  clerkMiddleware((req) => ({
-    publishableKey: publishableKeyFromHost(
-      getClerkProxyHost(req) ?? "",
-      process.env.CLERK_PUBLISHABLE_KEY,
-    ),
-  })),
+  clerkMiddleware({
+    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
+    secretKey: process.env.CLERK_SECRET_KEY,
+  }),
 );
 
 app.use("/api", router);
PATCH_EOF_MARKER_7c3d1

echo "==> Aplicando as mudancas..."
git apply /tmp/corrigir-auth-clerk.patch

echo "==> Commitando..."
git add -A
git commit -m "Corrige autenticacao Clerk: usa chaves diretas em vez de deteccao por dominio"

echo "==> Enviando pro GitHub..."
git push origin main

echo ""
echo "==> PRONTO. O Railway vai detectar e buildar sozinho em instantes."
