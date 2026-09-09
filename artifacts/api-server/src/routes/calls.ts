import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, childDeviceTokensTable, contactDeviceTokensTable } from "@workspace/db";
import { issueTurnCredentials } from "../lib/turn";

const router: IRouter = Router();

// Mesmo padrão de 3 mecanismos de auth opcionais usado em routes/media.ts
// (Responsável via Clerk, Criança via X-Child-Token, Contato via
// X-Contact-Token) -- credenciais TURN não são específicas de uma chamada,
// só precisam de "alguém autenticado, seja qual for o papel" pra não abrir
// a rota pro mundo (custo do provedor TURN é por credencial emitida).
async function resolveChildIdFromHeader(req: Request): Promise<string | null> {
  const header = req.headers["x-child-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await db
    .select()
    .from(childDeviceTokensTable)
    .where(eq(childDeviceTokensTable.tokenHash, tokenHash))
    .limit(1);
  return row?.childId ?? null;
}

async function resolveContactUserIdFromHeader(req: Request): Promise<string | null> {
  const header = req.headers["x-contact-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await db
    .select()
    .from(contactDeviceTokensTable)
    .where(eq(contactDeviceTokensTable.tokenHash, tokenHash))
    .limit(1);
  return row?.contactUserId ?? null;
}

/**
 * POST /api/calls/turn-credentials
 * Devolve credenciais TURN de curta duração (ver lib/turn.ts) -- chamado
 * pelo cliente pouco antes de iniciar/atender uma chamada. Não recebe nem
 * precisa de callId: é só "alguém autenticado pediu credencial pra montar
 * um RTCPeerConnection", a autorização de quem-liga-pra-quem acontece
 * depois, no convite via socket (ver signaling/index.ts).
 */
router.post("/calls/turn-credentials", async (req, res) => {
  const auth = getAuth(req);
  const parentUserId = auth.userId ?? null;
  const childId = parentUserId ? null : await resolveChildIdFromHeader(req);
  const contactUserId = parentUserId || childId ? null : await resolveContactUserIdFromHeader(req);
  if (!parentUserId && !childId && !contactUserId) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  const iceServers = await issueTurnCredentials();
  return res.json({ iceServers });
});

export default router;
