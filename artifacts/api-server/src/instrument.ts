// Monitoramento de erro em produção (Sentry) -- Marcelo não precisa mais
// pedir pra eu checar os logs da Railway manualmente quando algo quebra.
// Só ativa se SENTRY_DSN estiver configurada (Railway → variáveis do
// serviço api-server); sem ela, isso não faz nada -- dev local não
// precisa de conta Sentry nenhuma. Importado como a PRIMEIRA linha de
// index.ts, de propósito: precisa rodar antes de app.ts (e tudo que ele
// importa: express, pg via drizzle etc) pra auto-instrumentação de
// tracing funcionar direito.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    // Amostra pequena de traces de performance -- o objetivo principal
    // aqui é erro, não APM completo. Ajustar pra cima se o Marcelo quiser
    // mais visibilidade de performance depois.
    tracesSampleRate: 0.1,
  });
}
