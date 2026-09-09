import { logger } from "./logger";

// Credenciais TURN de curta duração pra atravessar NAT/rede de celular na
// chamada de voz/vídeo (pedido explícito do Marcelo: "fazer acontecer sem
// erros" -- em boa parte das redes móveis/corporativas STUN sozinho não
// basta, a chamada P2P direta falha e cai). Provedor gerenciado (Cloudflare
// Calls, ver CLOUDFLARE_TURN_* abaixo) em vez de hospedar coturn no Railway
// -- Railway não lida bem com relay de UDP cru. Troca de provedor depois
// (Twilio NTS, Metered.ca) é só reescrever o corpo desta função -- o resto
// do app só enxerga o RTCIceServer[] devolvido por issueTurnCredentials.
export type RtcIceServer = { urls: string | string[]; username?: string; credential?: string };

const FALLBACK_ICE_SERVERS: RtcIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export async function issueTurnCredentials(): Promise<RtcIceServer[]> {
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  if (!apiToken || !keyId) {
    // Sem as env vars configuradas ainda -- cai pra STUN público (funciona
    // em NAT aberto, falha em NAT simétrico/rede corporativa). Aceitável só
    // como fallback de desenvolvimento, não pra produção -- ver plano.
    return FALLBACK_ICE_SERVERS;
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 3600 }),
      },
    );
    if (!res.ok) {
      logger.error({ status: res.status }, "turn_credentials_fetch_failed");
      return FALLBACK_ICE_SERVERS;
    }
    const data = (await res.json()) as { iceServers?: RtcIceServer | RtcIceServer[] };
    if (!data.iceServers) return FALLBACK_ICE_SERVERS;
    return Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
  } catch (err) {
    logger.error({ err }, "turn_credentials_fetch_error");
    return FALLBACK_ICE_SERVERS;
  }
}
