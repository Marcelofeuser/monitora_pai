// Mesma lista para HTTP e Socket.IO. Uma configuração explícita substitui
// os padrões, permitindo isolar staging sem autorizar domínios de produção.
const defaultAuthorizedParties = [
  "https://pwa-production-336a.up.railway.app",
  "https://api-server-production-c955.up.railway.app",
  "https://responsavel.amparakids.com",
  "https://crianca.amparakids.com",
  "https://amparakids.com",
  // Tokens das aplicações nativas usam o Frontend API de produção do Clerk
  // como `azp`. Manter essa origem explícita preserva a validação contra
  // vazamento de sessão entre subdomínios sem bloquear iOS/Android.
  "https://clerk.amparakids.com",
];

export function getClerkAuthorizedParties(): string[] {
  const configured = process.env.CLERK_AUTHORIZED_PARTIES;
  if (configured === undefined) return [...defaultAuthorizedParties];

  const origins = configured.split(",").map((value) => value.trim());
  if (origins.length === 0 || origins.some((value) => !value)) {
    throw new Error("CLERK_AUTHORIZED_PARTIES must be a comma-separated list of explicit origins");
  }

  return [...new Set(origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error("CLERK_AUTHORIZED_PARTIES contains an invalid origin");
    }
    const localDevelopment = process.env.NODE_ENV !== "production"
      && url.protocol === "http:"
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localDevelopment)
      || url.username || url.password || url.pathname !== "/"
      || url.search || url.hash || url.hostname.includes("*")
    ) {
      // Não ecoar o valor: uma URL mal configurada pode conter credenciais.
      throw new Error("CLERK_AUTHORIZED_PARTIES requires HTTPS origins without credentials, paths or wildcards");
    }
    return url.origin;
  }))];
}

function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1] ?? null;
}

/**
 * Lê somente a presença da claim `azp` para escolher a política de validação.
 * O conteúdo ainda não é confiável aqui: assinatura, emissor, expiração e sessão
 * continuam sendo verificados pelo Clerk logo depois.
 */
export function clerkTokenHasAuthorizedParty(token: string): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return false;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      azp?: unknown;
    };
    return typeof claims.azp === "string" && claims.azp.length > 0;
  } catch {
    return false;
  }
}

/**
 * Tokens web possuem `azp` e permanecem restritos à allowlist. Tokens nativos
 * do Clerk podem omitir `azp` quando não há Origin; nesse caso, omitimos apenas
 * essa checagem adicional. Todas as demais validações do Clerk continuam ativas.
 */
export function getClerkAuthorizedPartiesForAuthorization(
  authorization: string | undefined,
): string[] | undefined {
  const token = bearerToken(authorization);
  if (token && !clerkTokenHasAuthorizedParty(token)) return undefined;
  return getClerkAuthorizedParties();
}

export function getClerkAuthorizedPartiesForToken(token: string): string[] | undefined {
  return clerkTokenHasAuthorizedParty(token) ? getClerkAuthorizedParties() : undefined;
}
