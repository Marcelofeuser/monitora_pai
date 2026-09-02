import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  usersTable,
  screenTimeSettingsTable,
  screenTimeUsageTable,
  childLocksTable,
} from "@workspace/db";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";

const router: IRouter = Router();

// "YYYY-MM-DD" no fuso do servidor (Railway roda em UTC) — não é o fuso do
// Marcelo, então a virada do dia pode ficar ~3h adiantada em relação ao
// horário de Brasília. Aceitável pra um contador de uso diário; não vale a
// complexidade de guardar fuso por criança nesta fase.
function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function assertIsParentOfChild(parentId: string, childId: string): Promise<boolean> {
  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, parentId)))
    .limit(1);
  return Boolean(child);
}

async function getUsageMinutes(childId: string, date: string): Promise<number> {
  const [row] = await db
    .select()
    .from(screenTimeUsageTable)
    .where(and(eq(screenTimeUsageTable.childId, childId), eq(screenTimeUsageTable.date, date)))
    .limit(1);
  return row?.minutesUsed ?? 0;
}

async function isLockedManually(childId: string): Promise<boolean> {
  const [row] = await db.select().from(childLocksTable).where(eq(childLocksTable.childId, childId)).limit(1);
  return Boolean(row);
}

/**
 * GET /api/screen-time/:childId
 * Responsável: uso de hoje, limite configurado e se está bloqueada agora
 * (manual ou por ter estourado o limite).
 */
router.get("/screen-time/:childId", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const { childId } = req.params;
  if (!(await assertIsParentOfChild(auth.userId, childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  const [settings] = await db
    .select()
    .from(screenTimeSettingsTable)
    .where(eq(screenTimeSettingsTable.childId, childId))
    .limit(1);
  const minutesUsedToday = await getUsageMinutes(childId, todayDateString());
  const manuallyLocked = await isLockedManually(childId);
  const dailyLimitMinutes = settings?.dailyLimitMinutes ?? null;
  const overLimit = dailyLimitMinutes !== null && minutesUsedToday >= dailyLimitMinutes;

  return res.json({
    dailyLimitMinutes,
    minutesUsedToday,
    locked: manuallyLocked || overLimit,
    lockReason: manuallyLocked ? "manual" : overLimit ? "limit" : null,
  });
});

const setLimitSchema = z.object({ dailyLimitMinutes: z.number().int().min(1).max(1440).nullable() });

/**
 * POST /api/screen-time/:childId/limit
 * Responsável define (ou remove, mandando null) o limite diário de uso.
 */
router.post("/screen-time/:childId/limit", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const { childId } = req.params;
  if (!(await assertIsParentOfChild(auth.userId, childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  const parsed = setLimitSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  await db
    .insert(screenTimeSettingsTable)
    .values({ childId, dailyLimitMinutes: parsed.data.dailyLimitMinutes })
    .onConflictDoUpdate({
      target: screenTimeSettingsTable.childId,
      set: { dailyLimitMinutes: parsed.data.dailyLimitMinutes, updatedAt: new Date() },
    });

  return res.json({ ok: true, dailyLimitMinutes: parsed.data.dailyLimitMinutes });
});

/**
 * POST /api/screen-time/:childId/lock
 * POST /api/screen-time/:childId/unlock
 * Bloqueio/desbloqueio manual e imediato (item 11 — "bloqueio temporário"),
 * independente do limite diário.
 */
router.post("/screen-time/:childId/lock", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const { childId } = req.params;
  if (!(await assertIsParentOfChild(auth.userId, childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  await db
    .insert(childLocksTable)
    .values({ childId, lockedByParentId: auth.userId })
    .onConflictDoUpdate({
      target: childLocksTable.childId,
      set: { lockedAt: new Date(), lockedByParentId: auth.userId },
    });

  return res.json({ ok: true, locked: true });
});

router.post("/screen-time/:childId/unlock", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const { childId } = req.params;
  if (!(await assertIsParentOfChild(auth.userId, childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }

  await db.delete(childLocksTable).where(eq(childLocksTable.childId, childId));

  return res.json({ ok: true, locked: false });
});

/**
 * GET /api/child/screen-time/status
 * A Criança consulta se está bloqueada agora — sem detalhe nenhum de
 * configuração (ela não pode ver/mudar limite, só saber se está travada).
 */
router.get("/child/screen-time/status", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const childId = req.childId;
  if (!childId) return res.status(401).json({ error: "not_authenticated" });

  const [settings] = await db
    .select()
    .from(screenTimeSettingsTable)
    .where(eq(screenTimeSettingsTable.childId, childId))
    .limit(1);
  const minutesUsedToday = await getUsageMinutes(childId, todayDateString());
  const manuallyLocked = await isLockedManually(childId);
  const dailyLimitMinutes = settings?.dailyLimitMinutes ?? null;
  const overLimit = dailyLimitMinutes !== null && minutesUsedToday >= dailyLimitMinutes;

  return res.json({
    locked: manuallyLocked || overLimit,
    lockReason: manuallyLocked ? "manual" : overLimit ? "limit" : null,
  });
});

/**
 * POST /api/child/screen-time/heartbeat
 * O app da Criança manda isso a cada ~60s enquanto está aberto e em
 * primeiro plano (ver PairingJoin.tsx) — cada heartbeat soma 1 minuto no
 * total de hoje. Responde já com o status atualizado, pra Criança saber na
 * hora se acabou de estourar o limite.
 */
router.post("/child/screen-time/heartbeat", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const childId = req.childId;
  if (!childId) return res.status(401).json({ error: "not_authenticated" });

  const date = todayDateString();
  await db
    .insert(screenTimeUsageTable)
    .values({ childId, date, minutesUsed: 1 })
    .onConflictDoUpdate({
      target: [screenTimeUsageTable.childId, screenTimeUsageTable.date],
      set: { minutesUsed: sql`${screenTimeUsageTable.minutesUsed} + 1`, updatedAt: new Date() },
    });

  const [settings] = await db
    .select()
    .from(screenTimeSettingsTable)
    .where(eq(screenTimeSettingsTable.childId, childId))
    .limit(1);
  const minutesUsedToday = await getUsageMinutes(childId, date);
  const manuallyLocked = await isLockedManually(childId);
  const dailyLimitMinutes = settings?.dailyLimitMinutes ?? null;
  const overLimit = dailyLimitMinutes !== null && minutesUsedToday >= dailyLimitMinutes;

  return res.json({
    locked: manuallyLocked || overLimit,
    lockReason: manuallyLocked ? "manual" : overLimit ? "limit" : null,
  });
});

export default router;
