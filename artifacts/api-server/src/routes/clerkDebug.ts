import { Router, type IRouter } from "express";
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * DIAGNÓSTICO TEMPORÁRIO — investigação do 401 not_authenticated.
 * Rota pública (sem auth) que testa a CLERK_SECRET_KEY diretamente contra a
 * Clerk Backend API, e reporta o formato/instância das duas chaves — sem
 * nunca expor os valores completos. Remover depois de descobrir a causa raiz.
 *
 * GET /api/__debug/clerk-check
 */
router.get("/__debug/clerk-check", async (_req, res) => {
  const pub = process.env.CLERK_PUBLISHABLE_KEY ?? "";
  const secret = process.env.CLERK_SECRET_KEY ?? "";

  const decodePublishableKey = (key: string) => {
    // pk_test_<base64(frontend-api-host)>$ ou pk_live_<...>
    const match = key.match(/^pk_(test|live)_([A-Za-z0-9+/=]+)$/);
    if (!match) return { valid: false as const };
    try {
      const decoded = Buffer.from(match[2], "base64").toString("utf8");
      return {
        valid: true as const,
        env: match[1],
        frontendApiHost: decoded.replace(/\$$/, ""),
      };
    } catch {
      return { valid: false as const };
    }
  };

  const pubInfo = decodePublishableKey(pub);
  const secretPrefixMatch = secret.match(/^sk_(test|live)_/);

  const result: Record<string, unknown> = {
    publishableKey: {
      present: Boolean(pub),
      length: pub.length,
      hasWhitespace: pub !== pub.trim(),
      ...pubInfo,
    },
    secretKey: {
      present: Boolean(secret),
      length: secret.length,
      hasWhitespace: secret !== secret.trim(),
      env: secretPrefixMatch?.[1] ?? null,
      looksWellFormed: Boolean(secretPrefixMatch),
    },
  };

  const startedAt = Date.now();
  try {
    // Chamada direta à Backend API usando a secret key — não depende de
    // nenhum token de sessão do cliente. Se isso falhar ou demorar, o
    // problema é a secret key / conectividade com a Clerk API, não o token
    // que o frontend está mandando.
    const list = await clerkClient.users.getUserList({ limit: 1 });
    result.backendApiCall = {
      ok: true,
      durationMs: Date.now() - startedAt,
      userCount: list.totalCount,
    };
  } catch (err) {
    const e = err as {
      status?: number;
      message?: string;
      errors?: unknown;
      clerkTraceId?: string;
    };
    result.backendApiCall = {
      ok: false,
      durationMs: Date.now() - startedAt,
      status: e?.status ?? null,
      message: e?.message ?? String(err),
      errors: e?.errors ?? null,
      clerkTraceId: e?.clerkTraceId ?? null,
    };
  }

  logger.info(result, "clerk_debug_check");
  return res.status(200).json(result);
});

export default router;
