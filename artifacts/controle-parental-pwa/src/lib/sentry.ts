// Monitoramento de erro em produção (Sentry) -- Marcelo não precisa mais
// pedir pra eu checar os logs da Railway manualmente quando algo quebra
// pro lado do Responsável. Só ativa se VITE_SENTRY_DSN estiver configurada
// (Railway → variáveis do serviço pwa, ANTES do build -- vars VITE_* são
// embutidas em tempo de build, não de runtime); sem ela, captureError não
// faz nada -- dev local não precisa de conta Sentry nenhuma.
import * as Sentry from '@sentry/react';

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Amostra pequena de traces de performance -- o objetivo principal
    // aqui é erro, não APM completo.
    tracesSampleRate: 0.1,
  });
}

// Usado pelo ErrorBoundary (components/error-boundary.tsx) -- captura o
// erro que já ia pro console.error de qualquer forma, sem duplicar lógica
// de "tem DSN ou não" em mais de um lugar.
export function captureError(error: unknown, extra?: Record<string, unknown>): void {
  if (!dsn) return;
  Sentry.captureException(error, extra ? { extra } : undefined);
}
