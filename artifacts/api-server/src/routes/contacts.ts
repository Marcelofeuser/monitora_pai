import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, contactsTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

async function assertIsParentOfChild(parentId: string, childId: string) {
  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, parentId)))
    .limit(1);
  return Boolean(child);
}

const requestContactSchema = z.object({
  childId: z.string().uuid(),
  contactName: z.string().min(1).max(120),
  contactPhone: z.string().max(30).optional(),
});

/**
 * POST /api/contacts
 * A Criança (ou o Responsável, em nome dela) solicita adicionar um contato.
 * Sempre nasce como "pending" — nunca é aprovado automaticamente.
 */
router.post("/contacts", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = requestContactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [contact] = await db
    .insert(contactsTable)
    .values({
      childId: parsed.data.childId,
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      status: "pending",
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

export default router;
