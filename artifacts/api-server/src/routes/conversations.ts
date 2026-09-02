import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or, asc } from "drizzle-orm";
import { db, conversationsTable, messagesTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";

const router: IRouter = Router();

// Canal privado Responsável <-> Criança: nunca é espelhado (ver regra em
// messages.ts). Uma só conversa por par Responsável/Criança — criada na
// primeira vez que alguém dos dois lados abre a tela ou manda mensagem.
async function getOrCreatePrivateConversation(parentId: string, childId: string) {
  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.isParentChildPrivate, true),
        or(
          and(eq(conversationsTable.participantAId, parentId), eq(conversationsTable.participantBId, childId)),
          and(eq(conversationsTable.participantAId, childId), eq(conversationsTable.participantBId, parentId)),
        ),
      ),
    )
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(conversationsTable)
    .values({ participantAId: parentId, participantBId: childId, isParentChildPrivate: true })
    .returning();
  return created;
}

async function listMessages(conversationId: string) {
  return db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(asc(messagesTable.createdAt));
}

/**
 * GET /api/conversations/private?childId=...
 * Responsável: retorna (criando se preciso) a conversa privada com essa
 * criança + o histórico de mensagens.
 */
router.get("/conversations/private", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const childId = String(req.query.childId ?? "");
  if (!childId) return res.status(400).json({ error: "missing_child_id" });

  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, auth.userId)))
    .limit(1);
  if (!child) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const conversation = await getOrCreatePrivateConversation(auth.userId, childId);
  const messages = await listMessages(conversation.id);
  return res.json({ conversation, messages });
});

const sendPrivateMessageSchema = z.object({
  childId: z.string().min(1),
  textContent: z.string().min(1).max(4000),
});

/**
 * POST /api/conversations/private/messages
 * Responsável manda mensagem pra criança no canal privado.
 */
router.post("/conversations/private/messages", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = sendPrivateMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, parsed.data.childId), eq(usersTable.parentId, auth.userId)))
    .limit(1);
  if (!child) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const conversation = await getOrCreatePrivateConversation(auth.userId, parsed.data.childId);
  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationId: conversation.id,
      senderId: auth.userId,
      type: "text",
      textContent: parsed.data.textContent,
    })
    .returning();

  return res.status(201).json(message);
});

/**
 * GET /api/child/conversations/private
 * Criança (autenticada por token de dispositivo, ver childAuth.ts): retorna
 * a conversa privada com o Responsável dela + histórico de mensagens.
 */
router.get(
  "/child/conversations/private",
  requireChildAuth,
  async (req: ChildAuthedRequest, res) => {
    const childId = req.childId;
    if (!childId) return res.status(401).json({ error: "not_authenticated" });

    const [child] = await db.select().from(usersTable).where(eq(usersTable.id, childId)).limit(1);
    if (!child?.parentId) return res.status(404).json({ error: "child_not_paired" });

    const conversation = await getOrCreatePrivateConversation(child.parentId, childId);
    const messages = await listMessages(conversation.id);
    return res.json({ conversation, messages });
  },
);

const sendChildMessageSchema = z.object({
  textContent: z.string().min(1).max(4000),
});

/**
 * POST /api/child/conversations/private/messages
 * Criança manda mensagem pro Responsável no canal privado.
 */
router.post(
  "/child/conversations/private/messages",
  requireChildAuth,
  async (req: ChildAuthedRequest, res) => {
    const childId = req.childId;
    if (!childId) return res.status(401).json({ error: "not_authenticated" });

    const parsed = sendChildMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    }

    const [child] = await db.select().from(usersTable).where(eq(usersTable.id, childId)).limit(1);
    if (!child?.parentId) return res.status(404).json({ error: "child_not_paired" });

    const conversation = await getOrCreatePrivateConversation(child.parentId, childId);
    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        senderId: childId,
        type: "text",
        textContent: parsed.data.textContent,
      })
      .returning();

    return res.status(201).json(message);
  },
);

export default router;
