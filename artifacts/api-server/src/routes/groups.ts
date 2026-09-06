import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, inArray, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable, contactsTable, groupsTable, groupMembersTable, groupMessagesTable } from "@workspace/db";
import { uploadSingleMediaFile } from "../middlewares/mediaUpload";
import { extractMessageInput } from "./conversations";
import { sendPushToChild, sendPushToParent } from "../lib/webPush";
import { sendFcmToParent } from "../lib/fcm";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";
import { requireContactAuth, type ContactAuthedRequest } from "../middlewares/contactAuth";

const router: IRouter = Router();

async function assertIsParentOfChild(parentId: string, childId: string): Promise<boolean> {
  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, parentId)))
    .limit(1);
  return Boolean(child);
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
router.post("/groups/:id/messages", uploadSingleMediaFile, async (req, res) => {
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

// Avisa o Responsavel (os dois canais, igual notify.ts) quando quem
// mandou NAO foi ele -- Crianca ou Contato escrevendo no grupo. Grupo
// nao tem debounce de 30min feito ainda (ao contrario do canal 1:1);
// como sao poucas mensagens numa familia, manda sempre por enquanto.
async function notifyParentOfGroupMessage(group: { name: string; createdByParentId: string }, senderName: string): Promise<void> {
  const payload = { title: group.name, body: `${senderName}: nova mensagem no grupo`, url: "/conversations" };
  await Promise.all([sendPushToParent(group.createdByParentId, payload), sendFcmToParent(group.createdByParentId, payload)]);
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
