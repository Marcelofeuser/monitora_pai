import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, parentRelationshipEnum } from "@workspace/db";
import { ensureParentUser } from "../lib/parentUser";
import { z } from "zod/v4";

const router: IRouter = Router();

/**
 * GET /api/me
 * Dados do Responsável autenticado — nome (sempre sincronizado com o
 * Clerk, ver lib/parentUser.ts) e o relacionamento que ele escolheu em
 * Configurações (pai/mãe/avó/tio/etc — pedido do Marcelo, ver
 * parentRelationshipEnum em lib/db/src/schema/users.ts). `relationship`
 * vem `null` até ele escolher pela primeira vez — o frontend cai no
 * rótulo genérico "Responsável" nesse caso.
 */
router.get("/me", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parentUser = await ensureParentUser(auth.userId);
  return res.json({
    id: parentUser.id,
    name: parentUser.name,
    relationship: parentUser.relationship,
  });
});

const updateMeSchema = z.object({
  relationship: z.enum(parentRelationshipEnum.enumValues),
});

/**
 * PATCH /api/me
 * Responsável escolhe (ou troca) como quer ser chamado na tela da
 * Criança — "pai", "mae", "avo_m", "avo_f", "tio", "tia" ou "responsavel".
 */
router.patch("/me", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  // Garante que a linha existe (mesmo se o Responsável nunca tiver criado
  // um pareamento ainda) antes de atualizar o relacionamento.
  await ensureParentUser(auth.userId);

  const [updated] = await db
    .update(usersTable)
    .set({ relationship: parsed.data.relationship })
    .where(eq(usersTable.id, auth.userId))
    .returning();

  return res.json({
    id: updated.id,
    name: updated.name,
    relationship: updated.relationship,
  });
});

export default router;
