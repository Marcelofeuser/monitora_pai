import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes, randomUUID, createHash } from "crypto";
import { eq, and, or, asc, isNull, gt } from "drizzle-orm";
import {
  db,
  contactsTable,
  usersTable,
  conversationsTable,
  pairingTokensTable,
  contactInviteTokensTable,
  contactDeviceTokensTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";

const router: IRouter = Router();

async function assertIsParentOfChild(parentId: string, childId: string) {
  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, parentId)))
    .limit(1);
  return Boolean(child);
}

/**
 * GET /api/children
 * Lista as crianças vinculadas ao Responsável autenticado — usado pelo
 * frontend para saber qual childId consultar nas telas de Conversas/Localização.
 */
router.get("/children", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  // ORDER BY createdAt: sem isso a ordem não era garantida — com mais de
  // uma criança vinculada, o frontend (que sempre olha children[0]) podia
  // mostrar dados da criança "errada" de forma inconsistente entre
  // requisições.
  const children = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.role, "child"), eq(usersTable.parentId, auth.userId)))
    .orderBy(asc(usersTable.createdAt));

  return res.json(children);
});

const contactStatusFilter = z.enum(["pending", "approved", "denied", "revoked"]).optional();

/**
 * GET /api/contacts?childId=...&status=approved
 * Lista contatos de uma criança, com filtro opcional de status.
 * Substitui a antiga rota fixa /contacts/pending por algo mais geral.
 */
router.get("/contacts", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const childId = String(req.query.childId ?? "");
  if (!childId) return res.status(400).json({ error: "missing_child_id" });

  const statusParsed = contactStatusFilter.safeParse(req.query.status);
  if (!statusParsed.success) return res.status(400).json({ error: "invalid_status" });

  const isParent = await assertIsParentOfChild(auth.userId, childId);
  if (!isParent) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const conditions = statusParsed.data
    ? and(eq(contactsTable.childId, childId), eq(contactsTable.status, statusParsed.data))
    : eq(contactsTable.childId, childId);

  const contacts = await db.select().from(contactsTable).where(conditions);
  return res.json(contacts);
});

const requestContactSchema = z.object({
  childId: z.string().uuid(),
  contactName: z.string().min(1).max(120),
  contactPhone: z.string().max(30).optional(),
});

/**
 * POST /api/contacts
 * A Criança nunca adiciona ninguém sozinha — ela não tem uma rota pra
 * isso, e não teria como chamar esta (é autenticada por Clerk, e ela não
 * tem conta Clerk). Só o Responsável adiciona um contato pra ela, e como
 * é o próprio Responsável fazendo isso (não um pedido da Criança pra
 * aprovar depois), o contato já nasce "approved" — não existe mais um
 * passo de aprovação separado.
 *
 * Antes esta rota não conferia se quem chamava era realmente o
 * Responsável daquela criança — qualquer conta logada podia adicionar
 * contato pra qualquer childId. Corrigido junto.
 */
router.post("/contacts", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = requestContactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const isParent = await assertIsParentOfChild(auth.userId, parsed.data.childId);
  if (!isParent) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const [contact] = await db
    .insert(contactsTable)
    .values({
      childId: parsed.data.childId,
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      status: "approved",
    })
    .returning();

  return res.status(201).json(contact);
});

/**
 * GET /api/contacts/pending?childId=...
 * Responsável lista solicitações pendentes de aprovação.
 */
router.get("/contacts/pending", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const childId = String(req.query.childId ?? "");
  if (!childId) return res.status(400).json({ error: "missing_child_id" });

  const isParent = await assertIsParentOfChild(auth.userId, childId);
  if (!isParent) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const pending = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.childId, childId), eq(contactsTable.status, "pending")));

  return res.json(pending);
});

const decisionSchema = z.object({
  decision: z.enum(["approved", "denied", "revoked"]),
});

/**
 * PATCH /api/contacts/:id/decision
 * Responsável aprova, nega ou revoga um contato.
 * Único ponto de escrita que muda o status — mantém o fluxo auditável.
 */
router.patch("/contacts/:id/decision", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, req.params.id))
    .limit(1);

  if (!contact) return res.status(404).json({ error: "contact_not_found" });

  const isParent = await assertIsParentOfChild(auth.userId, contact.childId);
  if (!isParent) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const [updated] = await db
    .update(contactsTable)
    .set({ status: parsed.data.decision, decidedAt: new Date() })
    .where(eq(contactsTable.id, contact.id))
    .returning();

  return res.json(updated);
});

/**
 * DELETE /api/contacts/:id
 * Exclui um contato de verdade (não é o mesmo que "revoked" — aquilo só
 * muda o status e mantém a linha; isso apaga por completo). Pedido do
 * Marcelo: opção de excluir qualquer contato, não só negar/revogar acesso.
 * Se o contato estiver em algum grupo, sai de lá junto — group_members
 * referencia contacts com ON DELETE CASCADE (ver schema/groups.ts).
 */
router.delete("/contacts/:id", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const [contact] = await db
    .select()
    .from(contactsTable)
    .where(eq(contactsTable.id, req.params.id))
    .limit(1);

  if (!contact) return res.status(404).json({ error: "contact_not_found" });

  const isParent = await assertIsParentOfChild(auth.userId, contact.childId);
  if (!isParent) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  await db.delete(contactsTable).where(eq(contactsTable.id, contact.id));

  return res.json({ ok: true });
});

/**
 * DELETE /api/children/:id
 * Exclui uma Criança inteira (perfil de verdade, não "revogar"). Pedido do
 * Marcelo depois de notar várias crianças duplicadas na tela de Conversas —
 * sobra de repareamentos de antes de existir "Reconectar" (cada perda de
 * conexão do aparelho criava uma criança nova do zero). Ação irreversível:
 * apaga histórico de mensagens, localização, tempo de uso e contatos dela.
 *
 * A maioria das tabelas que referenciam usersTable.id já tem ON DELETE
 * CASCADE no schema (contacts, groups, locations, child_device_tokens,
 * screen_time_settings, screen_time_usage, child_locks, push_subscriptions,
 * pairing_tokens.reconnect_child_id) — o Postgres limpa tudo isso sozinho
 * quando a linha da Criança é apagada. As exceções, sem cascade, tratadas
 * manualmente aqui:
 *   - conversations.participant_a_id / participant_b_id — apagamos as
 *     conversas da Criança primeiro; isso cascateia messages (via
 *     conversation_id) e mirror_log (via message_id) junto.
 *   - pairing_tokens.resulting_child_user_id — não é uma referência viva,
 *     é só o registro histórico de qual criança nasceu daquele QR; em vez
 *     de apagar o token, só desvinculamos (seta null).
 */
router.delete("/children/:id", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const childId = req.params.id;
  const isParent = await assertIsParentOfChild(auth.userId, childId);
  if (!isParent) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  await db.transaction(async (tx) => {
    await tx
      .delete(conversationsTable)
      .where(or(eq(conversationsTable.participantAId, childId), eq(conversationsTable.participantBId, childId)));

    await tx
      .update(pairingTokensTable)
      .set({ resultingChildUserId: null })
      .where(eq(pairingTokensTable.resultingChildUserId, childId));

    await tx.delete(usersTable).where(eq(usersTable.id, childId));
  });

  return res.json({ ok: true });
});

/**
 * GET /api/child/contacts
 * Criança (token de dispositivo): lista os contatos aprovados dela, pra
 * saber com quem já pode conversar dentro do app (ver /child/conversations/contact/:contactUserId).
 */
router.get("/child/contacts", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const childId = req.childId;
  if (!childId) return res.status(401).json({ error: "not_authenticated" });

  const contacts = await db
    .select()
    .from(contactsTable)
    .where(and(eq(contactsTable.childId, childId), eq(contactsTable.status, "approved")));
  return res.json(contacts);
});

const CONTACT_INVITE_TTL_DAYS = 7;

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * POST /api/contacts/:id/invite
 * Gera um link/QR de convite pra esse contato virar um participante de
 * verdade do app (conta própria + token de dispositivo) -- pedido do
 * Marcelo: hoje "contato" é só um nome digitado, sem jeito de ele entrar
 * no app pra conversar de fato com a Criança (limitação documentada em
 * schema/groups.ts). Mesmo mecanismo do pareamento da Criança, adaptado.
 */
router.post("/contacts/:id/invite", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, req.params.id)).limit(1);
  if (!contact) return res.status(404).json({ error: "contact_not_found" });

  const isParent = await assertIsParentOfChild(auth.userId, contact.childId);
  if (!isParent) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + CONTACT_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(contactInviteTokensTable)
    .values({
      token,
      parentId: auth.userId,
      childId: contact.childId,
      contactId: contact.id,
      contactName: contact.contactName,
      expiresAt,
    })
    .returning();

  return res.status(201).json({
    token: invite.token,
    joinUrl: `${process.env.APP_URL ?? ""}/join-contact?token=${invite.token}`,
    expiresAt: invite.expiresAt,
    contactName: invite.contactName,
  });
});

/**
 * GET /api/contacts/invite/:token
 * Público -- quem foi convidado ainda não tem conta nenhuma. Mostra o
 * nome pré-preenchido (editável na confirmação) e de qual criança é.
 */
router.get("/contacts/invite/:token", async (req, res) => {
  const [invite] = await db
    .select()
    .from(contactInviteTokensTable)
    .where(
      and(
        eq(contactInviteTokensTable.token, req.params.token),
        isNull(contactInviteTokensTable.usedAt),
        gt(contactInviteTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!invite) return res.status(400).json({ error: "invalid_or_expired_token" });

  const [child] = await db.select().from(usersTable).where(eq(usersTable.id, invite.childId)).limit(1);

  return res.json({ contactName: invite.contactName, childName: child?.name ?? null, expiresAt: invite.expiresAt });
});

const confirmInviteSchema = z.object({ contactName: z.string().min(1).max(120).optional() });

/**
 * POST /api/contacts/invite/:token/confirm
 * Público. Cria a conta do Contato (usersTable role='contact'), vincula
 * em contactsTable.contactUserId, e devolve o token de dispositivo dele
 * -- mesmo padrão de /api/pairing/confirm pra Criança (ver routes/pairing.ts).
 */
router.post("/contacts/invite/:token/confirm", async (req, res) => {
  const parsed = confirmInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [invite] = await db
    .select()
    .from(contactInviteTokensTable)
    .where(
      and(
        eq(contactInviteTokensTable.token, req.params.token),
        isNull(contactInviteTokensTable.usedAt),
        gt(contactInviteTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!invite) return res.status(400).json({ error: "invalid_or_expired_token" });

  const finalName = parsed.data.contactName?.trim() || invite.contactName;

  const [contactUser] = await db
    .insert(usersTable)
    .values({
      id: randomUUID(),
      role: "contact",
      name: finalName,
      parentId: invite.parentId,
    })
    .returning();

  await db
    .update(contactsTable)
    .set({ contactUserId: contactUser.id, contactName: finalName })
    .where(eq(contactsTable.id, invite.contactId));

  await db
    .update(contactInviteTokensTable)
    .set({ usedAt: new Date(), resultingContactUserId: contactUser.id })
    .where(eq(contactInviteTokensTable.id, invite.id));

  const rawDeviceToken = randomBytes(32).toString("base64url");
  const deviceTokenHash = createHash("sha256").update(rawDeviceToken).digest("hex");
  await db.insert(contactDeviceTokensTable).values({ contactUserId: contactUser.id, tokenHash: deviceTokenHash });

  const [child] = await db.select().from(usersTable).where(eq(usersTable.id, invite.childId)).limit(1);

  return res.status(200).json({
    contactUserId: contactUser.id,
    contactName: finalName,
    deviceToken: rawDeviceToken,
    childId: invite.childId,
    childName: child?.name ?? null,
  });
});

export default router;
