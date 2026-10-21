// Mesma lista para HTTP e Socket.IO. Uma configuração explícita substitui
// os padrões, permitindo isolar staging sem autorizar domínios de produção.
const defaultAuthorizedParties = [
  "https://pwa-production-336a.up.railway.app",
  "https://api-server-production-c955.up.railway.app",
  "https://responsavel.amparakids.com",
  "https://crianca.amparakids.com",
  "https://amparakids.com",
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
