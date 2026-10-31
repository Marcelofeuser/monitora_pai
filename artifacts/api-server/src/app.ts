import express, { type Express } from "express";
import * as Sentry from "@sentry/node";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import { pairingRateLimitSecret } from "./lib/pairingRateLimit";
import { getClerkAuthorizedPartiesForAuthorization } from "./lib/clerkConfig";
import healthRouter from "./routes/health";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();
// Falha no startup, em vez de aceitar tentativas sem a proteção configurada.
pairingRateLimitSecret();
// Lista de IPs/CIDRs dos proxies confiáveis; ausente = não confiar em headers.
// Não usar true ou contagem de saltos sem verificar todos os caminhos de entrada.
if (process.env.TRUSTED_PROXY_CIDRS) {
  app.set("trust proxy", process.env.TRUSTED_PROXY_CIDRS.split(",").map((value) => value.trim()));
}

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
app.use(cors({ credentials: true, origin: true, exposedHeaders: ["Retry-After"] }));
// Liveness pública: não depende de sessão, chamadas ao Clerk ou parsing de corpo.
// Configuração inválida no startup continua impedindo a inicialização.
app.use("/api", healthRouter);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
// Webhooks Stripe precisam do corpo bruto para validar a assinatura HMAC.
app.use("/api/billing/webhook", express.raw({ type: "application/json", limit: "1mb" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    authorizedParties: getClerkAuthorizedPartiesForAuthorization(req.get("authorization")),
  })),
);

app.use("/api", router);

// Sentry.setupExpressErrorHandler é um no-op se SENTRY_DSN não estiver
// configurada (ver instrument.ts) -- seguro chamar sempre. Tem que vir
// DEPOIS das rotas e ANTES do handler de erro customizado abaixo, senão
// o Sentry nunca vê o erro (o handler abaixo não faz next(err)).
Sentry.setupExpressErrorHandler(app);

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
