import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or, asc } from "drizzle-orm";
import { db, conversationsTable, messagesTable, usersTable, contactsTable } from "@workspace/db";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";
import { requireContactAuth, type ContactAuthedRequest } from "../middlewares/contactAuth";
import { uploadSingleMediaFile } from "../middlewares/mediaUpload";
import { kindForMime, maxBytesForMime, saveMedia } from "../lib/mediaStorage";
import { isAllowedSticker } from "../lib/stickers";
import { notifyChildOfActivity, notifyParentOfActivity } from "../lib/notify";
import { mirrorAndNotify } from "../lib/mirror";

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

type MessageInput = {
  type: "text" | "photo" | "video" | "audio";
  textContent: string | null;
  contentUrl: string | null;
};

// Um envio pode ser: (1) uma foto ou vídeo de verdade, anexado como
// multipart (campo "file") — validado por mimetype e tamanho antes de
// gravar em disco; (2) uma figurinha, que não é upload nenhum — é só um
// emoji de uma lista fechada (ver lib/stickers.ts), guardado como
// contentUrl="emoji:<emoji>" pra o frontend saber renderizar grande, sem
// balão; ou (3) texto puro, o caso de sempre. As duas rotas de envio
// (Responsável e Criança) compartilham essa mesma lógica de extração —
// só muda quem está autenticado.
async function extractMessageInput(req: Request, res: Response): Promise<MessageInput | null> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  const body = req.body as Record<string, unknown>;
  const rawText = typeof body?.textContent === "string" ? body.textContent.trim() : "";
  const stickerEmoji = typeof body?.stickerEmoji === "string" ? body.stickerEmoji : "";

  if (file) {
    const kind = kindForMime(file.mimetype);
    if (!kind) {
      res.status(400).json({ error: "unsupported_media_type" });
      return null;
    }
    if (file.size > maxBytesForMime(file.mimetype)) {
      res.status(413).json({ error: "file_too_large" });
      return null;
    }
    if (rawText.length > 1000) {
      res.status(400).json({ error: "caption_too_long" });
      return null;
    }
    const saved = await saveMedia(file.buffer, file.mimetype);
    return { type: kind, textContent: rawText || null, contentUrl: saved.url };
  }

  if (stickerEmoji) {
    if (!isAllowedSticker(stickerEmoji)) {
      res.status(400).json({ error: "invalid_sticker" });
      return null;
    }
    return { type: "photo", textContent: null, contentUrl: `emoji:${stickerEmoji}` };
  }

  if (!rawText) {
    res.status(400).json({ error: "empty_message" });
    return null;
  }
  if (rawText.length > 4000) {
    res.status(400).json({ error: "message_too_long" });
    return null;
  }
  return { type: "text", textContent: rawText, contentUrl: null };
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

/**
 * POST /api/conversations/private/messages
 * Responsável manda mensagem pra criança no canal privado — texto, foto,
 * vídeo (multipart, campo "file") ou figurinha (campo "stickerEmoji").
 */
router.post("/conversations/private/messages", uploadSingleMediaFile, async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const childId = typeof req.body?.childId === "string" ? req.body.childId : "";
  if (!childId) return res.status(400).json({ error: "missing_child_id" });

  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, auth.userId)))
    .limit(1);
  if (!child) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const input = await extractMessageInput(req, res);
  if (!input) return;

  const conversation = await getOrCreatePrivateConversation(auth.userId, childId);
  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationId: conversation.id,
      senderId: auth.userId,
      type: input.type,
      textContent: input.textContent,
      contentUrl: input.contentUrl,
    })
    .returning();

  // Só dispara quando é o Responsável escrevendo pra Criança (o envio do
  // lado da Criança não passa por aqui) — pedido do Marcelo: ela também
  // deve ser avisada quando recebe mensagem, não só ele.
  await notifyChildOfActivity({ conversation, parentUserId: auth.userId, childId });

  return res.status(201).json(message);
});

/**
 * GET /api/child/conversations/private
 * Criança (autenticada por token de dispositivo, ver childAuth.ts): retorna
 * a conversa privada com o Responsável dela + histórico de mensagens, mais
 * o nome do Responsável (pedido do Marcelo: mostrar quem é o Responsável
 * vinculado na tela da Criança).
 */
router.get(
  "/child/conversations/private",
  requireChildAuth,
  async (req: ChildAuthedRequest, res) => {
    const childId = req.childId;
    if (!childId) return res.status(401).json({ error: "not_authenticated" });

    const [child] = await db.select().from(usersTable).where(eq(usersTable.id, childId)).limit(1);
    if (!child?.parentId) return res.status(404).json({ error: "child_not_paired" });

    const [parent] = await db.select().from(usersTable).where(eq(usersTable.id, child.parentId)).limit(1);

    const conversation = await getOrCreatePrivateConversation(child.parentId, childId);
    const messages = await listMessages(conversation.id);
    return res.json({
      conversation,
      messages,
      parentName: parent?.name ?? null,
      parentRelationship: parent?.relationship ?? null,
    });
  },
);

/**
 * POST /api/child/conversations/private/messages
 * Criança manda mensagem pro Responsável no canal privado — texto, foto,
 * vídeo (multipart, campo "file") ou figurinha (campo "stickerEmoji").
 */
router.post(
  "/child/conversations/private/messages",
  requireChildAuth,
  uploadSingleMediaFile,
  async (req: ChildAuthedRequest, res) => {
    const childId = req.childId;
    if (!childId) return res.status(401).json({ error: "not_authenticated" });

    const [child] = await db.select().from(usersTable).where(eq(usersTable.id, childId)).limit(1);
    if (!child?.parentId) return res.status(404).json({ error: "child_not_paired" });

    const input = await extractMessageInput(req, res);
    if (!input) return;

    const conversation = await getOrCreatePrivateConversation(child.parentId, childId);
    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        senderId: childId,
        type: input.type,
        textContent: input.textContent,
        contentUrl: input.contentUrl,
      })
      .returning();

    // Só dispara quando é a Criança escrevendo pro Responsável (o envio do
    // lado do Responsável não passa por aqui) — item 10 do pedido.
    await notifyParentOfActivity({ conversation, senderId: childId, parentUserId: child.parentId });

    return res.status(201).json(message);
  },
);

// Conversa espelhada Criança <-> Contato aprovado: sempre isParentChildPrivate
// = false (regra central do produto -- ver messages.ts), então toda
// mensagem trocada aqui é logada em mirror_log e notifica o Responsável
// (mirrorAndNotify). Só existe depois que o Contato aceitou o convite e
// virou um usersTable de verdade (ver routes/contacts.ts).
async function getOrCreateContactConversation(childId: string, contactUserId: string) {
  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.isParentChildPrivate, false),
        or(
          and(eq(conversationsTable.participantAId, childId), eq(conversationsTable.participantBId, contactUserId)),
          and(eq(conversationsTable.participantAId, contactUserId), eq(conversationsTable.participantBId, childId)),
        ),
      ),
    )
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(conversationsTable)
    .values({ participantAId: childId, participantBId: contactUserId, isParentChildPrivate: false })
    .returning();
  return created;
}

/**
 * GET /api/child/conversations/contact/:contactUserId
 * Criança: conversa (cria se preciso) com um Contato aprovado que já
 * aceitou o convite, + histórico.
 */
router.get(
  "/child/conversations/contact/:contactUserId",
  requireChildAuth,
  async (req: ChildAuthedRequest, res) => {
    const childId = req.childId;
    if (!childId) return res.status(401).json({ error: "not_authenticated" });
    const contactUserId = req.params.contactUserId;

    const [contactRow] = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.childId, childId),
          eq(contactsTable.contactUserId, contactUserId),
          eq(contactsTable.status, "approved"),
        ),
      )
      .limit(1);
    if (!contactRow) return res.status(403).json({ error: "not_an_approved_contact" });

    const conversation = await getOrCreateContactConversation(childId, contactUserId);
    const messages = await listMessages(conversation.id);
    return res.json({ conversation, messages, contactName: contactRow.contactName });
  },
);

/**
 * POST /api/child/conversations/contact/:contactUserId/messages
 * Criança manda mensagem pra um Contato aprovado -- sempre espelhada pro
 * Responsável (mirrorAndNotify).
 */
router.post(
  "/child/conversations/contact/:contactUserId/messages",
  requireChildAuth,
  uploadSingleMediaFile,
  async (req: ChildAuthedRequest, res) => {
    const childId = req.childId;
    if (!childId) return res.status(401).json({ error: "not_authenticated" });
    const contactUserId = req.params.contactUserId;

    const [child] = await db.select().from(usersTable).where(eq(usersTable.id, childId)).limit(1);
    if (!child?.parentId) return res.status(404).json({ error: "child_not_paired" });

    const [contactRow] = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.childId, childId),
          eq(contactsTable.contactUserId, contactUserId),
          eq(contactsTable.status, "approved"),
        ),
      )
      .limit(1);
    if (!contactRow) return res.status(403).json({ error: "not_an_approved_contact" });

    const input = await extractMessageInput(req, res);
    if (!input) return;

    const conversation = await getOrCreateContactConversation(childId, contactUserId);
    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        senderId: childId,
        type: input.type,
        textContent: input.textContent,
        contentUrl: input.contentUrl,
      })
      .returning();

    await mirrorAndNotify({ conversation, messageId: message.id, senderId: childId, parentId: child.parentId });

    return res.status(201).json(message);
  },
);

/**
 * GET /api/contact/conversations/with-child
 * Contato (token de dispositivo, ver contactAuth.ts): conversa com a
 * Criança dele -- um Contato só tem UMA Criança (a do convite que
 * aceitou), por isso não precisa de childId na URL.
 */
router.get(
  "/contact/conversations/with-child",
  requireContactAuth,
  async (req: ContactAuthedRequest, res) => {
    const contactUserId = req.contactUserId;
    if (!contactUserId) return res.status(401).json({ error: "not_authenticated" });

    const [contactRow] = await db.select().from(contactsTable).where(eq(contactsTable.contactUserId, contactUserId)).limit(1);
    if (!contactRow) return res.status(404).json({ error: "contact_not_found" });

    const conversation = await getOrCreateContactConversation(contactRow.childId, contactUserId);
    const messages = await listMessages(conversation.id);
    const [child] = await db.select().from(usersTable).where(eq(usersTable.id, contactRow.childId)).limit(1);
    return res.json({ conversation, messages, childName: child?.name ?? null });
  },
);

/**
 * POST /api/contact/conversations/with-child/messages
 * Contato manda mensagem pra Criança dele -- sempre espelhada pro
 * Responsável (mirrorAndNotify).
 */
router.post(
  "/contact/conversations/with-child/messages",
  requireContactAuth,
  uploadSingleMediaFile,
  async (req: ContactAuthedRequest, res) => {
    const contactUserId = req.contactUserId;
    if (!contactUserId) return res.status(401).json({ error: "not_authenticated" });

    const [contactRow] = await db.select().from(contactsTable).where(eq(contactsTable.contactUserId, contactUserId)).limit(1);
    if (!contactRow) return res.status(404).json({ error: "contact_not_found" });

    const [child] = await db.select().from(usersTable).where(eq(usersTable.id, contactRow.childId)).limit(1);
    if (!child?.parentId) return res.status(404).json({ error: "child_not_found" });

    const input = await extractMessageInput(req, res);
    if (!input) return;

    const conversation = await getOrCreateContactConversation(contactRow.childId, contactUserId);
    const [message] = await db
      .insert(messagesTable)
      .values({
        conversationId: conversation.id,
        senderId: contactUserId,
        type: input.type,
        textContent: input.textContent,
        contentUrl: input.contentUrl,
      })
      .returning();

    await mirrorAndNotify({ conversation, messageId: message.id, senderId: contactUserId, parentId: child.parentId });

    return res.status(201).json(message);
  },
);

export default router;
