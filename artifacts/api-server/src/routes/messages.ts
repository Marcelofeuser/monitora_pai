import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import {
  db,
  conversationsTable,
  messagesTable,
  mirrorLogTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(["text", "audio", "video", "photo"]),
  textContent: z.string().max(4000).optional(),
  contentUrl: z.string().url().optional(),
});

/**
 * POST /api/messages
 *
 * REGRA CENTRAL DO PRODUTO: toda mensagem trocada é gravada normalmente.
 * Se a conversa NÃO for o canal privado Responsável<->Criança
 * (isParentChildPrivate = false), a mensagem é automaticamente espelhada
 * para o Responsável dessa criança via mirror_log.
 * O canal privado nunca gera entrada em mirror_log — é a única exceção.
 */
router.post("/messages", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [conversation] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, parsed.data.conversationId))
    .limit(1);

  if (!conversation) return res.status(404).json({ error: "conversation_not_found" });

  const isParticipant =
    conversation.participantAId === auth.userId || conversation.participantBId === auth.userId;
  if (!isParticipant) return res.status(403).json({ error: "not_a_participant" });

  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationId: conversation.id,
      senderId: auth.userId,
      type: parsed.data.type,
      textContent: parsed.data.textContent,
      contentUrl: parsed.data.contentUrl,
    })
    .returning();

  // Espelhamento seletivo — o coração da regra de negócio.
  if (!conversation.isParentChildPrivate) {
    const otherParticipantId =
      conversation.participantAId === auth.userId
        ? conversation.participantBId
        : conversation.participantAId;

    // Descobre quem é a Criança nessa conversa (pode ser o remetente ou o
    // destinatário) para então achar o Responsável dela.
    const [senderUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, auth.userId))
      .limit(1);
    const [otherUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, otherParticipantId))
      .limit(1);

    const childInConversation =
      senderUser?.role === "child" ? senderUser : otherUser?.role === "child" ? otherUser : null;

    if (childInConversation?.parentId) {
      await db.insert(mirrorLogTable).values({
        messageId: message.id,
        mirroredToParentId: childInConversation.parentId,
      });
    }
  }

  return res.status(201).json(message);
});

/**
 * GET /api/messages/mirrored?parentId=...
 * Painel do Responsável: lista tudo que foi espelhado para ele.
 * Nunca inclui o canal privado — porque o canal privado nunca gera
 * entrada em mirror_log (ver regra acima).
 */
router.get("/messages/mirrored", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const rows = await db
    .select({
      message: messagesTable,
      mirroredAt: mirrorLogTable.mirroredAt,
    })
    .from(mirrorLogTable)
    .innerJoin(messagesTable, eq(mirrorLogTable.messageId, messagesTable.id))
    .where(eq(mirrorLogTable.mirroredToParentId, auth.userId));

  return res.json(rows);
});

export default router;
