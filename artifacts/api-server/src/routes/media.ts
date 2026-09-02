import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { and, eq } from "drizzle-orm";
import {
  childDeviceTokensTable,
  conversationsTable,
  db,
  messagesTable,
  mirrorLogTable,
} from "@workspace/db";
import {
  contentTypeForFilename,
  isValidMediaFilename,
  mediaFileExists,
  mediaFilePath,
} from "../lib/mediaStorage";

const router: IRouter = Router();

// A Criança não tem conta Clerk (ver middlewares/childAuth.ts), então esta
// rota precisa reconhecer os dois jeitos de autenticar — Responsável via
// Clerk, Criança via X-Child-Token — porque foto/vídeo trafegam nos dois
// sentidos do canal privado. Não dá pra usar requireChildAuth direto
// porque ele falha a request se não tiver token; aqui o token é opcional
// (o outro lado da checagem é getAuth).
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

/**
 * GET /api/media/:filename
 *
 * Serve um arquivo de mídia (foto/vídeo) só pra quem tem direito de ver a
 * mensagem dona dele: os dois participantes da conversa, ou o Responsável
 * pra quem ela foi espelhada (ver mirror_log em routes/messages.ts). O
 * nome do arquivo é um UUID aleatório, mas isso sozinho NUNCA é
 * autorização — sempre confere contra a mensagem e a conversa antes de
 * abrir o arquivo. <img>/<video src> não mandam header customizado, então
 * o frontend busca essa rota com fetch autenticado e transforma a
 * resposta num object URL (ver lib/media.ts no PWA).
 */
router.get("/media/:filename", async (req, res) => {
  const { filename } = req.params;
  if (!isValidMediaFilename(filename)) {
    return res.status(404).json({ error: "not_found" });
  }

  const auth = getAuth(req);
  const parentUserId = auth.userId ?? null;
  const childId = parentUserId ? null : await resolveChildIdFromHeader(req);
  if (!parentUserId && !childId) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  const contentUrl = `/api/media/${filename}`;
  const [message] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.contentUrl, contentUrl))
    .limit(1);
  if (!message) return res.status(404).json({ error: "not_found" });

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, message.conversationId))
    .limit(1);
  if (!conversation) return res.status(404).json({ error: "not_found" });

  let authorized = false;
  if (childId) {
    authorized = conversation.participantAId === childId || conversation.participantBId === childId;
  } else if (parentUserId) {
    authorized =
      conversation.participantAId === parentUserId || conversation.participantBId === parentUserId;
    if (!authorized) {
      const [mirrored] = await db
        .select()
        .from(mirrorLogTable)
        .where(
          and(
            eq(mirrorLogTable.messageId, message.id),
            eq(mirrorLogTable.mirroredToParentId, parentUserId),
          ),
        )
        .limit(1);
      authorized = Boolean(mirrored);
    }
  }

  if (!authorized) return res.status(404).json({ error: "not_found" });
  if (!(await mediaFileExists(filename))) return res.status(404).json({ error: "not_found" });

  res.setHeader("Content-Type", contentTypeForFilename(filename));
  res.setHeader("Cache-Control", "private, max-age=86400, immutable");
  createReadStream(mediaFilePath(filename)).pipe(res);
  return undefined;
});

export default router;
