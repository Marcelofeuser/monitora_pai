import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * POST /api/notifications/subscribe
 * Guarda (ou atualiza) a assinatura de push do navegador do Responsável —
 * chamado depois que ele liga o toggle "Notificações" e o navegador
 * confirma a assinatura (Push API). Se o mesmo endpoint já existia (ex:
 * ele desligou e ligou de novo no mesmo navegador), atualiza em vez de
 * duplicar.
 */
router.post("/notifications/subscribe", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  await db
    .insert(pushSubscriptionsTable)
    .values({
      parentUserId: auth.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptionsTable.endpoint,
      set: {
        parentUserId: auth.userId,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
      },
    });

  return res.status(201).json({ ok: true });
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

/**
 * POST /api/notifications/unsubscribe
 * Chamado quando o Responsável desliga o toggle — remove só a assinatura
 * daquele navegador (não mexe nos outros aparelhos dele).
 */
router.post("/notifications/unsubscribe", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  await db
    .delete(pushSubscriptionsTable)
    .where(
      and(
        eq(pushSubscriptionsTable.parentUserId, auth.userId),
        eq(pushSubscriptionsTable.endpoint, parsed.data.endpoint),
      ),
    );

  return res.json({ ok: true });
});

export default router;
