import { afterEach, describe, expect, it, vi } from "vitest";
import { getClerkAuthorizedParties } from "../src/lib/clerkConfig";

afterEach(() => vi.unstubAllEnvs());

describe("origens autorizadas do Clerk", () => {
  it("preserva os domínios atuais quando não há configuração explícita", () => {
    vi.stubEnv("CLERK_AUTHORIZED_PARTIES", undefined);
    expect(getClerkAuthorizedParties()).toContain("https://responsavel.amparakids.com");
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
