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
// Remover depois de descobrir a causa raiz do 401.
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/pairing") || req.path.startsWith("/api/children")) {
    const authHeader = req.headers.authorization;
    const auth = getAuth(req);
    logger.info(
      {
        hasAuthHeader: Boolean(authHeader),
        authHeaderLength: authHeader?.length ?? 0,
        authHeaderPrefix: authHeader?.slice(0, 20),
        userId: auth?.userId ?? null,
        authReason: (auth as { reason?: string })?.reason ?? null,
        authMessage: (auth as { message?: string })?.message ?? null,
      },
      "clerk_auth_debug",
    );
  }
  next();
});

app.use("/api", router);

export default app;
