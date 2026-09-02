import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable, contactsTable, groupsTable, groupMembersTable } from "@workspace/db";

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

export default router;
