import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// DIAGNÓSTICO TEMPORÁRIO: marca o instante antes do clerkMiddleware rodar,
// pra medir quanto tempo a própria verificação do Clerk está levando.
app.use((req, _res, next) => {
  (req as { _clerkDebugStart?: number })._clerkDebugStart = Date.now();
  next();
});

app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    // PWA e api-server ficam em domínios diferentes no Railway — sem isso,
    // o Clerk pode rejeitar o token por não reconhecer o domínio de origem.
    authorizedParties: [
      "https://pwa-production-336a.up.railway.app",
      "https://api-server-production-c955.up.railway.app",
    ],
  }),
);

// DIAGNÓSTICO TEMPORÁRIO: loga por que a autenticação está falhando.
// A versão anterior lia auth.reason/auth.message, que NÃO existem no objeto
// retornado por getAuth() (só existem no RequestState interno do Clerk) —
// por isso sempre logava null, independente da causa real. auth.debug() é a
// API certa pra isso. Remover depois de descobrir a causa raiz do 401.
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/pairing") || req.path.startsWith("/api/children")) {
    const authHeader = req.headers.authorization;
    const auth = getAuth(req);
    const start = (req as { _clerkDebugStart?: number })._clerkDebugStart;
    let debugData: unknown = null;
    try {
      debugData = auth?.debug?.();
    } catch (err) {
      debugData = { debugCallFailed: String(err) };
    }
    logger.info(
      {
        clerkMiddlewareDurationMs: start ? Date.now() - start : null,
        hasAuthHeader: Boolean(authHeader),
        authHeaderLength: authHeader?.length ?? 0,
        authHeaderPrefix: authHeader?.slice(0, 20),
        userId: auth?.userId ?? null,
        tokenType: auth?.tokenType ?? null,
        isAuthenticated: auth?.isAuthenticated ?? null,
        debug: debugData,
      },
      "clerk_auth_debug",
    );
  }
  next();
});

app.use("/api", router);

// Handler de erro global: sem isso, um erro não tratado numa rota async
// (ex: uma query do Drizzle que falha) só aparecia nos logs como um
// stack trace cru do finalhandler do Express — sem contexto estruturado,
// sem err.cause (onde o driver do Postgres bota a mensagem real, tipo
// "invalid input syntax for type uuid"), e o cliente só via um 500 vazio.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const e = err as { message?: string; cause?: { message?: string; code?: string }; stack?: string };
  logger.error(
    {
      err: {
        message: e?.message,
        causeMessage: e?.cause?.message,
        causeCode: e?.cause?.code,
        stack: e?.stack,
      },
      path: req.path,
      method: req.method,
    },
    "unhandled_request_error",
  );
  if (res.headersSent) return;
  res.status(500).json({ error: "internal_error" });
});

export default app;
