import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc } from "drizzle-orm";
import { db, locationsTable, usersTable } from "@workspace/db";
import { z } from "zod/v4";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";

const router: IRouter = Router();

const reportLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().positive().optional(),
});

/**
 * POST /api/location
 * O aparelho da Criança reporta a posição atual. Autenticado pelo token de
 * dispositivo (header X-Child-Token) — a Criança não usa Clerk. Só existe
 * uma linha aqui quando a Criança escolhe compartilhar; nunca é inferido.
 */
router.post("/location", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const childId = req.childId;
  if (!childId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = reportLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  await db.insert(locationsTable).values({
    childId,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    accuracyMeters: parsed.data.accuracyMeters,
  });

  return res.status(201).json({ ok: true });
});

/**
 * GET /api/location/:childId
 * Responsável consulta a última localização compartilhada por essa
 * Criança. Retorna `null` (200) quando ela nunca compartilhou nada —
 * nunca inventa ou estima uma posição.
 */
router.get("/location/:childId", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const childId = req.params.childId;
  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, auth.userId)))
    .limit(1);
  if (!child) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const [latest] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.childId, childId))
    .orderBy(desc(locationsTable.recordedAt))
    .limit(1);

  return res.status(200).json(latest ?? null);
});

export default router;
