import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, inArray, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable, contactsTable, groupsTable, groupMembersTable, groupMessagesTable } from "@workspace/db";
import { uploadSingleMediaFile } from "../middlewares/mediaUpload";
import { kindForMime, maxBytesForMime, saveMedia } from "../lib/mediaStorage";
import { extractMessageInput } from "./conversations";
import { sendPushToChild, sendPushToParent } from "../lib/webPush";
import { sendFcmToParent } from "../lib/fcm";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";
import { requireContactAuth, type ContactAuthedRequest } from "../middlewares/contactAuth";
import { isGuardianOfChild, getGuardiansOfChild } from "../lib/guardians";

const router: IRouter = Router();

// Item 13 do pedido (multiplos Responsaveis): delega pro helper
// compartilhado, que tambem aceita guardians adicionais, nao so
// createdByParentId/dono original -- ver lib/guardians.ts.
async function assertIsParentOfChild(parentId: string, childId: string): Promise<boolean> {
  return isGuardianOfChild(parentId, childId);
}

/**
 * GET /api/groups?childId=...
 * Responsável: lista os grupos daquela criança, com os contatos membros.
 */
router.get("/groups", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const childId = String(req.query.childId ?? "");
  if (!childId) return res.status(400).json({ error: "missing_child_id" });
  if (!(await assertIsParentOfChild(auth.userId, childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  const groups = await db.select().from(groupsTable).where(eq(groupsTable.childId, childId));
  const groupsWithMembers = await Promise.all(
    groups.map(async (group) => {
      const members = await db
        .select({ id: contactsTable.id, contactName: contactsTable.contactName })
        .from(groupMembersTable)
        .innerJoin(contactsTable, eq(groupMembersTable.contactId, contactsTable.id))
        .where(eq(groupMembersTable.groupId, group.id));
      return { ...group, members };
    }),
  );

  return res.json(groupsWithMembers);
});

const createGroupSchema = z.object({
  childId: z.string().min(1),
  name: z.string().min(1).max(80),
  contactIds: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * POST /api/groups
 *
 * Só o Responsável chama esta rota — a criação em si já é a "autorização"
 * exigida no item 8 do pedido ("tem que passar pela minha autorização").
 * Todo contactId precisa ser um contato JÁ APROVADO dessa mesma criança;
 * senão a rota rejeita (não dá pra colocar num grupo alguém que nem pode
 * conversar com ela 1:1).
 */
router.post("/groups", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = createGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }
  const { childId, name, contactIds } = parsed.data;

  if (!(await assertIsParentOfChild(auth.userId, childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  const approvedContacts = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(
      and(
        eq(contactsTable.childId, childId),
        eq(contactsTable.status, "approved"),
        inArray(contactsTable.id, contactIds),
      ),
    );
  if (approvedContacts.length !== contactIds.length) {
    return res.status(400).json({ error: "contacts_not_approved_for_this_child" });
  }

  const [group] = await db.insert(groupsTable).values({ childId, name, createdByParentId: auth.userId }).returning();
  await db.insert(groupMembersTable).values(contactIds.map((contactId) => ({ groupId: group.id, contactId })));

  return res.status(201).json(group);
});

/**
 * DELETE /api/groups/:id
 * Desfaz um grupo (remove os membros junto, via cascade).
 */
router.delete("/groups/:id", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, req.params.id)).limit(1);
  if (!group) return res.status(404).json({ error: "not_found" });
  if (!(await assertIsParentOfChild(auth.userId, group.childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  await db.delete(groupsTable).where(eq(groupsTable.id, group.id));
  return res.json({ ok: true });
});

/**
 * POST /api/groups/:id/photo
 * Responsável (ou outro guardian): define/troca a foto do grupo -- passo
 * do fluxo de criação ("colocar foto") e também usado pra trocar depois
 * pelo menu do balão. Multipart, campo "file", só imagem.
 */
// Express<Request> tipado explicitamente: o multer (uploadSingleMediaFile)
// na cadeia quebra a inferencia automatica de req.params a partir do path
// literal (mesma armadilha ja documentada no projeto -- ver POST
// /groups/:id/messages, algumas linhas abaixo, que ja usa esse padrao).
router.post("/groups/:id/photo", uploadSingleMediaFile, async (req: Request<{ id: string }>, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, req.params.id)).limit(1);
  if (!group) return res.status(404).json({ error: "not_found" });
  if (!(await assertIsParentOfChild(auth.userId, group.childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  const file = (req as typeof req & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: "missing_file" });
  if (kindForMime(file.mimetype) !== "photo") return res.status(400).json({ error: "unsupported_media_type" });
  if (file.size > maxBytesForMime(file.mimetype)) return res.status(413).json({ error: "file_too_large" });

  const saved = await saveMedia(file.buffer, file.mimetype);
  const [updated] = await db
    .update(groupsTable)
    .set({ photoUrl: saved.url })
    .where(eq(groupsTable.id, group.id))
    .returning();

  return res.json(updated);
});

const addMemberSchema = z.object({ contactId: z.string().uuid() });

/**
 * POST /api/groups/:id/members
 * Pedido do Marcelo: hoje só dava pra escolher os membros na criação do
 * grupo -- não tinha como adicionar alguém a um grupo já existente (ex:
 * criou o grupo só com a Verônica, depois quis colocar a Rafaella junto).
 * Mesma regra da criação: o contato precisa já estar aprovado pra essa
 * mesma criança.
 */
router.post("/groups/:id/members", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = addMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, req.params.id)).limit(1);
  if (!group) return res.status(404).json({ error: "not_found" });
  if (!(await assertIsParentOfChild(auth.userId, group.childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  const [contact] = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(
      and(
        eq(contactsTable.id, parsed.data.contactId),
        eq(contactsTable.childId, group.childId),
        eq(contactsTable.status, "approved"),
      ),
    )
    .limit(1);
  if (!contact) return res.status(400).json({ error: "contact_not_approved_for_this_child" });

  const [existing] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.contactId, contact.id)))
    .limit(1);
  if (!existing) {
    await db.insert(groupMembersTable).values({ groupId: group.id, contactId: contact.id });
  }

  return res.status(201).json({ ok: true });
});

/**
 * DELETE /api/groups/:id/members/:contactId
 * Tira um contato de um grupo sem apagar o grupo inteiro.
 */
router.delete("/groups/:id/members/:contactId", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, req.params.id)).limit(1);
  if (!group) return res.status(404).json({ error: "not_found" });
  if (!(await assertIsParentOfChild(auth.userId, group.childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  await db
    .delete(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.contactId, req.params.contactId)));

  return res.json({ ok: true });
});

// Busca o nome de cada participante possivel do grupo (Responsavel,
// Crianca, Contatos ja conectados) pra o frontend nao precisar de N
// requisicoes extras so pra exibir "quem mandou" no chat.
async function participantNames(group: { childId: string; createdByParentId: string }): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  const [parent] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, group.createdByParentId)).limit(1);
  if (parent) names[parent.id] = parent.name ?? "Responsavel";
  const [child] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, group.childId)).limit(1);
  if (child) names[child.id] = child.name ?? "Crianca";
  const members = await db
    .select({ contactUserId: contactsTable.contactUserId, contactName: contactsTable.contactName })
    .from(groupMembersTable)
    .innerJoin(contactsTable, eq(groupMembersTable.contactId, contactsTable.id))
    .where(eq(groupMembersTable.groupId, (group as { id?: string }).id ?? ""));
  for (const member of members) {
    if (member.contactUserId) names[member.contactUserId] = member.contactName;
  }
  return names;
}

/**
 * GET /api/groups/:id/messages
 * Responsavel: historico do chat do grupo, mais um mapa senderId->nome
 * (Responsavel, Crianca e Contatos ja conectados) pra exibir quem mandou
 * cada mensagem sem round-trip extra.
 */
router.get("/groups/:id/messages", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, req.params.id)).limit(1);
  if (!group) return res.status(404).json({ error: "not_found" });
  if (!(await assertIsParentOfChild(auth.userId, group.childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  const messages = await db
    .select()
    .from(groupMessagesTable)
    .where(eq(groupMessagesTable.groupId, group.id))
    .orderBy(asc(groupMessagesTable.createdAt));
  const names = await participantNames({ ...group });

  return res.json({ group, messages, participantNames: names });
});

/**
 * POST /api/groups/:id/messages
 * Responsavel manda mensagem no chat do grupo -- texto, foto, video
 * (multipart, campo "file") ou figurinha (campo "stickerEmoji"), mesma
 * logica de extractMessageInput usada no canal 1:1 (ver conversations.ts).
 * Ainda so cobre o lado do Responsavel; envio do lado da Crianca/Contato
 * do grupo entra numa proxima etapa.
 */
router.post("/groups/:id/messages", uploadSingleMediaFile, async (req: Request<{ id: string }>, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, req.params.id)).limit(1);
  if (!group) return res.status(404).json({ error: "not_found" });
  if (!(await assertIsParentOfChild(auth.userId, group.childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  const input = await extractMessageInput(req, res);
  if (!input) return;

  const [message] = await db
    .insert(groupMessagesTable)
    .values({
      groupId: group.id,
      senderId: auth.userId,
      type: input.type,
      textContent: input.textContent,
      contentUrl: input.contentUrl,
    })
    .returning();

  // So a Crianca tem push implementado hoje (Contatos ainda so tem
  // polling -- ver mirror.ts/notify.ts, mesma limitacao do chat 1:1).
  await sendPushToChild(group.childId, {
    title: group.name,
    body: input.textContent ?? "Nova mensagem no grupo",
    url: "./",
  });

  return res.status(201).json(message);
});

const GROUP_RENOTIFY_INTERVAL_MS = 30 * 60 * 1000;

// Avisa TODOS os Responsaveis da crianca do grupo (dono + guardians
// adicionais -- item 13 do pedido) quando quem mandou NAO foi um deles --
// Crianca ou Contato escrevendo no grupo. Mesmo debounce de 30min do canal
// 1:1 (ver notify.ts) -- antes o grupo mandava notificacao sempre, a cada
// mensagem (item 13 do checklist "O que FALTA").
async function notifyParentOfGroupMessage(
  group: { id: string; name: string; childId: string; lastNotifiedAt: Date | null },
  senderName: string,
): Promise<void> {
  if (group.lastNotifiedAt) {
    const elapsed = Date.now() - group.lastNotifiedAt.getTime();
    if (elapsed < GROUP_RENOTIFY_INTERVAL_MS) return;
  }

  // Marca ANTES de mandar -- mesmo motivo do notify.ts: evita reenvio
  // duplicado se duas mensagens chegarem quase juntas.
  await db.update(groupsTable).set({ lastNotifiedAt: new Date() }).where(eq(groupsTable.id, group.id));

  const guardians = await getGuardiansOfChild(group.childId);
  const payload = { title: group.name, body: `${senderName}: nova mensagem no grupo`, url: "/conversations" };
  await Promise.all(
    guardians.flatMap((g) => [sendPushToParent(g.id, payload), sendFcmToParent(g.id, payload)]),
  );
}

async function assertChildInGroup(childId: string, groupId: string) {
  const [group] = await db.select().from(groupsTable).where(and(eq(groupsTable.id, groupId), eq(groupsTable.childId, childId))).limit(1);
  return group ?? null;
}

async function assertContactInGroup(contactUserId: string, groupId: string) {
  const [row] = await db
    .select({ group: groupsTable })
    .from(groupMembersTable)
    .innerJoin(groupsTable, eq(groupMembersTable.groupId, groupsTable.id))
    .innerJoin(contactsTable, eq(groupMembersTable.contactId, contactsTable.id))
    .where(and(eq(groupMembersTable.groupId, groupId), eq(contactsTable.contactUserId, contactUserId)))
    .limit(1);
  return row?.group ?? null;
}

/**
 * POST /api/child/groups
 * Pedido do Marcelo: nao so o Responsavel cria grupo, a Crianca tambem
 * pode criar os grupos que ela quiser (mesma regra de sempre: so entre os
 * contatos ja aprovados dela). createdByParentId recebe o usersTable.id da
 * propria Crianca -- ver comentario no schema (groups.ts) sobre por que
 * isso nao precisou de coluna nova.
 */
router.post("/child/groups", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const childId = req.childId as string;
  const parsed = z.object({ name: z.string().min(1).max(80), contactIds: z.array(z.string().uuid()).min(1).max(50) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }
  const { name, contactIds } = parsed.data;

  const approvedContacts = await db
    .select({ id: contactsTable.id })
    .from(contactsTable)
    .where(
      and(
        eq(contactsTable.childId, childId),
        eq(contactsTable.status, "approved"),
        inArray(contactsTable.id, contactIds),
      ),
    );
  if (approvedContacts.length !== contactIds.length) {
    return res.status(400).json({ error: "contacts_not_approved_for_this_child" });
  }

  const [group] = await db.insert(groupsTable).values({ childId, name, createdByParentId: childId }).returning();
  await db.insert(groupMembersTable).values(contactIds.map((contactId) => ({ groupId: group.id, contactId })));

  return res.status(201).json(group);
});

/**
 * POST /api/child/groups/:id/photo
 * Mesma logica de /api/groups/:id/photo, so que pra Crianca colocar foto
 * num grupo que ela mesma criou (ou de que participa).
 */
router.post("/child/groups/:id/photo", requireChildAuth, uploadSingleMediaFile, async (req: ChildAuthedRequest, res) => {
  const group = await assertChildInGroup(req.childId as string, req.params.id);
  if (!group) return res.status(404).json({ error: "not_found" });

  const file = (req as typeof req & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: "missing_file" });
  if (kindForMime(file.mimetype) !== "photo") return res.status(400).json({ error: "unsupported_media_type" });
  if (file.size > maxBytesForMime(file.mimetype)) return res.status(413).json({ error: "file_too_large" });

  const saved = await saveMedia(file.buffer, file.mimetype);
  const [updated] = await db
    .update(groupsTable)
    .set({ photoUrl: saved.url })
    .where(eq(groupsTable.id, group.id))
    .returning();

  return res.json(updated);
});

/**
 * GET /api/child/groups
 * Crianca (token de dispositivo): lista os grupos dela, com nomes dos
 * membros -- pra montar a fileira de bolinhas na tela do chat.
 */
router.get("/child/groups", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const childId = req.childId as string;
  const childGroups = await db.select().from(groupsTable).where(eq(groupsTable.childId, childId));
  const withMembers = await Promise.all(
    childGroups.map(async (group) => {
      const members = await db
        .select({ id: contactsTable.id, contactName: contactsTable.contactName })
        .from(groupMembersTable)
        .innerJoin(contactsTable, eq(groupMembersTable.contactId, contactsTable.id))
        .where(eq(groupMembersTable.groupId, group.id));
      return { ...group, members };
    }),
  );
  return res.json(withMembers);
});

/**
 * GET /api/child/groups/:id/messages
 * Crianca: historico do chat de um grupo dela.
 */
router.get("/child/groups/:id/messages", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const group = await assertChildInGroup(req.childId as string, req.params.id);
  if (!group) return res.status(404).json({ error: "not_found" });

  const messages = await db
    .select()
    .from(groupMessagesTable)
    .where(eq(groupMessagesTable.groupId, group.id))
    .orderBy(asc(groupMessagesTable.createdAt));
  const names = await participantNames({ ...group });

  return res.json({ group, messages, participantNames: names });
});

/**
 * POST /api/child/groups/:id/messages
 * Crianca manda mensagem no grupo -- mesma extractMessageInput dos
 * outros canais (texto, foto, video, figurinha).
 */
router.post("/child/groups/:id/messages", requireChildAuth, uploadSingleMediaFile, async (req: ChildAuthedRequest, res) => {
  const childId = req.childId as string;
  const group = await assertChildInGroup(childId, req.params.id);
  if (!group) return res.status(404).json({ error: "not_found" });

  const input = await extractMessageInput(req, res);
  if (!input) return;

  const [message] = await db
    .insert(groupMessagesTable)
    .values({ groupId: group.id, senderId: childId, type: input.type, textContent: input.textContent, contentUrl: input.contentUrl })
    .returning();

  const [child] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, childId)).limit(1);
  await notifyParentOfGroupMessage(group, child?.name ?? "Crianca");

  return res.status(201).json(message);
});

/**
 * GET /api/contact/groups
 * Contato ja conectado (token de dispositivo): lista os grupos em que
 * ele foi colocado como membro.
 */
router.get("/contact/groups", requireContactAuth, async (req: ContactAuthedRequest, res) => {
  const contactUserId = req.contactUserId as string;
  const rows = await db
    .select({ group: groupsTable })
    .from(groupMembersTable)
    .innerJoin(groupsTable, eq(groupMembersTable.groupId, groupsTable.id))
    .innerJoin(contactsTable, eq(groupMembersTable.contactId, contactsTable.id))
    .where(eq(contactsTable.contactUserId, contactUserId));

  const withMembers = await Promise.all(
    rows.map(async ({ group }) => {
      const members = await db
        .select({ id: contactsTable.id, contactName: contactsTable.contactName })
        .from(groupMembersTable)
        .innerJoin(contactsTable, eq(groupMembersTable.contactId, contactsTable.id))
        .where(eq(groupMembersTable.groupId, group.id));
      return { ...group, members };
    }),
  );
  return res.json(withMembers);
});

/**
 * GET /api/contact/groups/:id/messages
 * Contato: historico do chat de um grupo do qual ele e membro conectado.
 */
router.get("/contact/groups/:id/messages", requireContactAuth, async (req: ContactAuthedRequest, res) => {
  const group = await assertContactInGroup(req.contactUserId as string, req.params.id);
  if (!group) return res.status(404).json({ error: "not_found" });

  const messages = await db
    .select()
    .from(groupMessagesTable)
    .where(eq(groupMessagesTable.groupId, group.id))
    .orderBy(asc(groupMessagesTable.createdAt));
  const names = await participantNames({ ...group });

  return res.json({ group, messages, participantNames: names });
});

/**
 * POST /api/contact/groups/:id/messages
 * Contato manda mensagem no grupo -- avisa Responsavel e Crianca (so a
 * Crianca tem push de verdade hoje; Contato e Responsavel usam os dois
 * canais ja existentes).
 */
router.post("/contact/groups/:id/messages", requireContactAuth, uploadSingleMediaFile, async (req: ContactAuthedRequest, res) => {
  const contactUserId = req.contactUserId as string;
  const group = await assertContactInGroup(contactUserId, req.params.id);
  if (!group) return res.status(404).json({ error: "not_found" });

  const input = await extractMessageInput(req, res);
  if (!input) return;

  const [message] = await db
    .insert(groupMessagesTable)
    .values({ groupId: group.id, senderId: contactUserId, type: input.type, textContent: input.textContent, contentUrl: input.contentUrl })
    .returning();

  const [contact] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, contactUserId)).limit(1);
  await Promise.all([
    notifyParentOfGroupMessage(group, contact?.name ?? "Contato"),
    sendPushToChild(group.childId, { title: group.name, body: `${contact?.name ?? "Contato"}: nova mensagem no grupo`, url: "./" }),
  ]);

  return res.status(201).json(message);
});

export default router;
