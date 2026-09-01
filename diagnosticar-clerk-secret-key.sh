#!/bin/bash
set -e

if [ ! -d ".git" ]; then
  echo "ERRO: rode este script DE DENTRO da pasta monitora_pai (onde tem uma pasta .git)."
  exit 1
fi

echo "==> Atualizando com o GitHub..."
git pull origin main

echo "==> Escrevendo o patch..."
cat > /tmp/diagnosticar-clerk.patch << 'PATCH_EOF_MARKER_9c1e4'
diff --git a/artifacts/api-server/src/app.ts b/artifacts/api-server/src/app.ts
index a542b12..8618881 100644
--- a/artifacts/api-server/src/app.ts
+++ b/artifacts/api-server/src/app.ts
@@ -34,6 +34,14 @@ app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 app.use(cors({ credentials: true, origin: true }));
 app.use(express.json());
 app.use(express.urlencoded({ extended: true }));
+
+// DIAGNÓSTICO TEMPORÁRIO: marca o instante antes do clerkMiddleware rodar,
+// pra medir quanto tempo a própria verificação do Clerk está levando.
+app.use((req, _res, next) => {
+  (req as { _clerkDebugStart?: number })._clerkDebugStart = Date.now();
+  next();
+});
+
 app.use(
   clerkMiddleware({
     publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
@@ -48,19 +56,31 @@ app.use(
 );

 // DIAGNÓSTICO TEMPORÁRIO: loga por que a autenticação está falhando.
-// Remover depois de descobrir a causa raiz do 401.
+// A versão anterior lia auth.reason/auth.message, que NÃO existem no objeto
+// retornado por getAuth() (só existem no RequestState interno do Clerk) —
+// por isso sempre logava null, independente da causa real. auth.debug() é a
+// API certa pra isso. Remover depois de descobrir a causa raiz do 401.
 app.use((req, _res, next) => {
   if (req.path.startsWith("/api/pairing") || req.path.startsWith("/api/children")) {
     const authHeader = req.headers.authorization;
     const auth = getAuth(req);
+    const start = (req as { _clerkDebugStart?: number })._clerkDebugStart;
+    let debugData: unknown = null;
+    try {
+      debugData = auth?.debug?.();
+    } catch (err) {
+      debugData = { debugCallFailed: String(err) };
+    }
     logger.info(
       {
+        clerkMiddlewareDurationMs: start ? Date.now() - start : null,
         hasAuthHeader: Boolean(authHeader),
         authHeaderLength: authHeader?.length ?? 0,
         authHeaderPrefix: authHeader?.slice(0, 20),
         userId: auth?.userId ?? null,
-        authReason: (auth as { reason?: string })?.reason ?? null,
-        authMessage: (auth as { message?: string })?.message ?? null,
+        tokenType: auth?.tokenType ?? null,
+        isAuthenticated: auth?.isAuthenticated ?? null,
+        debug: debugData,
       },
       "clerk_auth_debug",
     );
diff --git a/artifacts/api-server/src/routes/clerkDebug.ts b/artifacts/api-server/src/routes/clerkDebug.ts
new file mode 100644
index 0000000..6de4efd
--- /dev/null
+++ b/artifacts/api-server/src/routes/clerkDebug.ts
@@ -0,0 +1,87 @@
+import { Router, type IRouter } from "express";
+import { clerkClient } from "@clerk/express";
+import { logger } from "../lib/logger";
+
+const router: IRouter = Router();
+
+/**
+ * DIAGNÓSTICO TEMPORÁRIO — investigação do 401 not_authenticated.
+ * Rota pública (sem auth) que testa a CLERK_SECRET_KEY diretamente contra a
+ * Clerk Backend API, e reporta o formato/instância das duas chaves — sem
+ * nunca expor os valores completos. Remover depois de descobrir a causa raiz.
+ *
+ * GET /api/__debug/clerk-check
+ */
+router.get("/__debug/clerk-check", async (_req, res) => {
+  const pub = process.env.CLERK_PUBLISHABLE_KEY ?? "";
+  const secret = process.env.CLERK_SECRET_KEY ?? "";
+
+  const decodePublishableKey = (key: string) => {
+    // pk_test_<base64(frontend-api-host)>$ ou pk_live_<...>
+    const match = key.match(/^pk_(test|live)_([A-Za-z0-9+/=]+)$/);
+    if (!match) return { valid: false as const };
+    try {
+      const decoded = Buffer.from(match[2], "base64").toString("utf8");
+      return {
+        valid: true as const,
+        env: match[1],
+        frontendApiHost: decoded.replace(/\$$/, ""),
+      };
+    } catch {
+      return { valid: false as const };
+    }
+  };
+
+  const pubInfo = decodePublishableKey(pub);
+  const secretPrefixMatch = secret.match(/^sk_(test|live)_/);
+
+  const result: Record<string, unknown> = {
+    publishableKey: {
+      present: Boolean(pub),
+      length: pub.length,
+      hasWhitespace: pub !== pub.trim(),
+      ...pubInfo,
+    },
+    secretKey: {
+      present: Boolean(secret),
+      length: secret.length,
+      hasWhitespace: secret !== secret.trim(),
+      env: secretPrefixMatch?.[1] ?? null,
+      looksWellFormed: Boolean(secretPrefixMatch),
+    },
+  };
+
+  const startedAt = Date.now();
+  try {
+    // Chamada direta à Backend API usando a secret key — não depende de
+    // nenhum token de sessão do cliente. Se isso falhar ou demorar, o
+    // problema é a secret key / conectividade com a Clerk API, não o token
+    // que o frontend está mandando.
+    const list = await clerkClient.users.getUserList({ limit: 1 });
+    result.backendApiCall = {
+      ok: true,
+      durationMs: Date.now() - startedAt,
+      userCount: list.totalCount,
+    };
+  } catch (err) {
+    const e = err as {
+      status?: number;
+      message?: string;
+      errors?: unknown;
+      clerkTraceId?: string;
+    };
+    result.backendApiCall = {
+      ok: false,
+      durationMs: Date.now() - startedAt,
+      status: e?.status ?? null,
+      message: e?.message ?? String(err),
+      errors: e?.errors ?? null,
+      clerkTraceId: e?.clerkTraceId ?? null,
+    };
+  }
+
+  logger.info(result, "clerk_debug_check");
+  return res.status(200).json(result);
+});
+
+export default router;
diff --git a/artifacts/api-server/src/routes/index.ts b/artifacts/api-server/src/routes/index.ts
index c119609..e2aff83 100644
--- a/artifacts/api-server/src/routes/index.ts
+++ b/artifacts/api-server/src/routes/index.ts
@@ -3,6 +3,7 @@ import healthRouter from "./health";
 import pairingRouter from "./pairing";
 import contactsRouter from "./contacts";
 import messagesRouter from "./messages";
+import clerkDebugRouter from "./clerkDebug";

 const router: IRouter = Router();

@@ -10,5 +11,8 @@ router.use(healthRouter);
 router.use(pairingRouter);
 router.use(contactsRouter);
 router.use(messagesRouter);
+// DIAGNÓSTICO TEMPORÁRIO — remover junto com src/routes/clerkDebug.ts depois
+// de resolver o 401 not_authenticated.
+router.use(clerkDebugRouter);

 export default router;
PATCH_EOF_MARKER_9c1e4

echo "==> Aplicando as mudancas..."
git apply /tmp/diagnosticar-clerk.patch

echo "==> Commitando..."
git add -A
git commit -m "Adiciona rota de diagnostico da CLERK_SECRET_KEY e corrige log que sempre dava null"

echo "==> Enviando pro GitHub..."
git push origin main

echo ""
echo "==> PRONTO. O Railway vai detectar e buildar sozinho em instantes (1-2 min)."
echo "==> Depois do deploy, NAO precisa testar nada no navegador desta vez —"
echo "    a rota e publica, eu mesmo vou consultar:"
echo "    https://api-server-production-c955.up.railway.app/api/__debug/clerk-check"
