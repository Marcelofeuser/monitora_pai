#!/bin/bash
set -e

if [ ! -d ".git" ]; then
  echo "ERRO: rode este script DE DENTRO da pasta monitora_pai (onde tem uma pasta .git)."
  exit 1
fi

echo "==> Atualizando com o GitHub..."
git pull origin main

echo "==> Escrevendo o patch..."
cat > /tmp/authorized-parties.patch << 'PATCH_EOF_MARKER_5e91b'
diff --git a/artifacts/api-server/src/app.ts b/artifacts/api-server/src/app.ts
index 80f7d23..43acf73 100644
--- a/artifacts/api-server/src/app.ts
+++ b/artifacts/api-server/src/app.ts
@@ -38,6 +38,12 @@ app.use(
   clerkMiddleware({
     publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
     secretKey: process.env.CLERK_SECRET_KEY,
+    // PWA e api-server ficam em domínios diferentes no Railway — sem isso,
+    // o Clerk pode rejeitar o token por não reconhecer o domínio de origem.
+    authorizedParties: [
+      "https://pwa-production-336a.up.railway.app",
+      "https://api-server-production-c955.up.railway.app",
+    ],
   }),
 );
 
PATCH_EOF_MARKER_5e91b

echo "==> Aplicando as mudancas..."
git apply /tmp/authorized-parties.patch

echo "==> Commitando..."
git add -A
git commit -m "Declara dominios autorizados explicitamente no Clerk (authorizedParties)"

echo "==> Enviando pro GitHub..."
git push origin main

echo ""
echo "==> PRONTO. O Railway vai detectar e buildar sozinho em instantes."
