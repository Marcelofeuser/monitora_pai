import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clerkTokenHasAuthorizedParty,
  getClerkAuthorizedParties,
  getClerkAuthorizedPartiesForAuthorization,
  getClerkAuthorizedPartiesForToken,
} from "../src/lib/clerkConfig";

function unsignedToken(claims: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
}

afterEach(() => vi.unstubAllEnvs());

describe("origens autorizadas do Clerk", () => {
  it("preserva os domínios atuais quando não há configuração explícita", () => {
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", undefined);
    expect(getClerkAuthorizedParties()).toContain("https://responsavel.amparakids.com");
    expect(getClerkAuthorizedParties()).toContain("https://clerk.amparakids.com");
  });

  it("isola staging, normaliza origens e remove duplicatas", () => {
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", " https://pwa-staging.example.com/,https://pwa-staging.example.com,https://api-staging.example.com ");
    expect(getClerkAuthorizedParties()).toEqual([
      "https://pwa-staging.example.com", "https://api-staging.example.com",
    ]);
    expect(getClerkAuthorizedParties()).not.toContain("https://responsavel.amparakids.com");
  });

  it.each([
    "", "https://valid.example.com,", "https://*.example.com",
    "https://example.com/path", "https://example.com?query=value",
    "https://example.com#fragment", "https://user:password@example.com",
    "not-a-url", "http://remote.example.com", "ftp://example.com",
  ])("recusa configuração inválida sem ecoar o valor: %s", (origin) => {
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", origin);
    expect(() => getClerkAuthorizedParties()).toThrow(/CLERK_AUTHORIZED_PARTIES/);
    try { getClerkAuthorizedParties(); } catch (error) {
      expect(String(error)).not.toContain("user:password");
    }
  });

  it("permite localhost HTTP somente fora de produção", () => {
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", "http://localhost:5173");
    vi.stubEnv("NODE_ENV", "development");
    expect(getClerkAuthorizedParties()).toEqual(["http://localhost:5173"]);
    vi.stubEnv("NODE_ENV", "production");
    expect(() => getClerkAuthorizedParties()).toThrow(/CLERK_AUTHORIZED_PARTIES/);
  });
});

describe("política de authorized parties para tokens nativos", () => {
  it("mantém a allowlist para tokens web que possuem azp", () => {
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", "https://responsavel.amparakids.com");
    const token = unsignedToken({ azp: "https://responsavel.amparakids.com" });
    expect(clerkTokenHasAuthorizedParty(token)).toBe(true);
    expect(getClerkAuthorizedPartiesForToken(token)).toEqual([
      "https://responsavel.amparakids.com",
    ]);
    expect(getClerkAuthorizedPartiesForAuthorization(`Bearer ${token}`)).toEqual([
      "https://responsavel.amparakids.com",
    ]);
  });

  it("omite somente a checagem de azp para token nativo sem essa claim", () => {
    const token = unsignedToken({ sub: "user_native" });
    expect(clerkTokenHasAuthorizedParty(token)).toBe(false);
    expect(getClerkAuthorizedPartiesForToken(token)).toBeUndefined();
    expect(getClerkAuthorizedPartiesForAuthorization(`Bearer ${token}`)).toBeUndefined();
  });

  it("não afrouxa requisições sem Bearer nem esquemas diferentes", () => {
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", "https://responsavel.amparakids.com");
    expect(getClerkAuthorizedPartiesForAuthorization(undefined)).toEqual([
      "https://responsavel.amparakids.com",
    ]);
    expect(getClerkAuthorizedPartiesForAuthorization("Basic credentials")).toEqual([
      "https://responsavel.amparakids.com",
    ]);
  });

  it("deixa tokens malformados para a validação criptográfica do Clerk rejeitar", () => {
    expect(clerkTokenHasAuthorizedParty("not-a-jwt")).toBe(false);
    expect(getClerkAuthorizedPartiesForAuthorization("Bearer not-a-jwt")).toBeUndefined();
  });
});
