import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { count, desc, eq, ilike, or, sum } from "drizzle-orm";
import { z } from "zod/v4";
import {
  ambassadorsTable, ambassadorCommissionsTable, db, subscriptionsTable,
  usersTable, vouchersTable,
} from "@workspace/db";
import { ensureParentUser } from "../lib/parentUser";

const router: IRouter = Router();

function isSuperadmin(userId: string | null | undefined): userId is string {
  const configured = process.env.SUPERADMIN_CLERK_USER_IDS?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  return Boolean(userId && configured.includes(userId));
}

router.use(async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) return res.status(401).json({ error: "not_authenticated" });
  if (!isSuperadmin(userId)) return res.status(403).json({ error: "superadmin_required" });
  return next();
});

router.get("/overview", async (_req, res) => {
  const [[users], [activeSubscriptions], [vouchers], [ambassadors], commissions] = await Promise.all([
    db.select({ count: count() }).from(usersTable),
    db.select({ count: count() }).from(subscriptionsTable).where(eq(subscriptionsTable.status, "active")),
    db.select({ count: count() }).from(vouchersTable).where(eq(vouchersTable.active, true)),
    db.select({ count: count() }).from(ambassadorsTable).where(eq(ambassadorsTable.active, true)),
    db.select({ total: sum(ambassadorCommissionsTable.amountCents) }).from(ambassadorCommissionsTable).where(eq(ambassadorCommissionsTable.status, "accrued")),
  ]);
  return res.json({ users: users?.count ?? 0, activeSubscriptions: activeSubscriptions?.count ?? 0, activeVouchers: vouchers?.count ?? 0, activeAmbassadors: ambassadors?.count ?? 0, accruedCommissionCents: Number(commissions[0]?.total ?? 0) });
});

router.get("/users", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 120) : "";
  const rows = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, createdAt: usersTable.createdAt, plan: subscriptionsTable.plan, subscriptionStatus: subscriptionsTable.status, childrenLimit: subscriptionsTable.childrenLimit })
    .from(usersTable).leftJoin(subscriptionsTable, eq(subscriptionsTable.parentUserId, usersTable.id))
    .where(search ? or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`), ilike(usersTable.id, `%${search}%`)) : undefined)
    .orderBy(desc(usersTable.createdAt)).limit(100);
  return res.json({ users: rows });
});

const userPlanSchema = z.object({ plan: z.enum(["free", "paid"]), status: z.enum(["active", "past_due", "canceled"]), childrenLimit: z.number().int().min(1).max(50) });
router.patch("/users/:id/subscription", async (req, res) => {
  const parsed = userPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  const userId = req.params.id;
  const [user] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || user.role !== "parent") return res.status(404).json({ error: "parent_not_found" });
  const [existing] = await db.select({ id: subscriptionsTable.id }).from(subscriptionsTable).where(eq(subscriptionsTable.parentUserId, userId)).limit(1);
  const [subscription] = existing
    ? await db.update(subscriptionsTable).set(parsed.data).where(eq(subscriptionsTable.id, existing.id)).returning()
    : await db.insert(subscriptionsTable).values({ parentUserId: userId, ...parsed.data }).returning();
  return res.json({ subscription });
});

const voucherSchema = z.object({ code: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/), discountType: z.enum(["percent", "fixed"]), discountValue: z.coerce.number().int().positive(), maxRedemptions: z.coerce.number().int().positive().max(100000).nullable().optional(), expiresAt: z.string().datetime().nullable().optional() }).superRefine((value, ctx) => {
  if (value.discountType === "percent" && value.discountValue > 100) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Percentual máximo: 100" });
  if (value.discountType === "fixed" && value.discountValue > 100000000) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Valor máximo permitido excedido" });
});
router.get("/vouchers", async (_req, res) => res.json({ vouchers: await db.select().from(vouchersTable).orderBy(desc(vouchersTable.createdAt)).limit(200) }));
router.post("/vouchers", async (req, res) => {
  const parsed = voucherSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  const auth = getAuth(req);
  await ensureParentUser(auth.userId!);
  try {
    const [voucher] = await db.insert(vouchersTable).values({ ...parsed.data, code: parsed.data.code.toUpperCase(), expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null, createdBy: auth.userId! }).returning();
    return res.status(201).json({ voucher });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return res.status(409).json({ error: "voucher_code_exists" });
    throw error;
  }
});
router.patch("/vouchers/:id", async (req, res) => {
  const active = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!active.success) return res.status(400).json({ error: "invalid_body" });
  const [voucher] = await db.update(vouchersTable).set({ active: active.data.active }).where(eq(vouchersTable.id, req.params.id)).returning();
  if (!voucher) return res.status(404).json({ error: "voucher_not_found" });
  return res.json({ voucher });
});

const ambassadorSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.string().email().max(200), referralCode: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/), commissionPercent: z.coerce.number().min(0).max(100), fixedBenefitCents: z.coerce.number().int().min(0).max(100000000).default(0), benefitDescription: z.string().max(500).nullable().optional(), active: z.boolean().default(true) });
router.get("/ambassadors", async (_req, res) => {
  const [ambassadors, commissions] = await Promise.all([
    db.select().from(ambassadorsTable).orderBy(desc(ambassadorsTable.createdAt)).limit(200),
    db.select().from(ambassadorCommissionsTable).orderBy(desc(ambassadorCommissionsTable.createdAt)).limit(200),
  ]);
  return res.json({ ambassadors, commissions });
});
router.patch("/commissions/:id", async (req, res) => {
  const parsed = z.object({ status: z.enum(["accrued", "paid", "reversed"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body" });
  const [commission] = await db.update(ambassadorCommissionsTable).set({ status: parsed.data.status }).where(eq(ambassadorCommissionsTable.id, req.params.id)).returning();
  if (!commission) return res.status(404).json({ error: "commission_not_found" });
  return res.json({ commission });
});
router.post("/ambassadors", async (req, res) => {
  const parsed = ambassadorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  try {
    const { commissionPercent, ...profile } = parsed.data;
    const [ambassador] = await db.insert(ambassadorsTable).values({ ...profile, referralCode: profile.referralCode.toUpperCase(), commissionBps: Math.round(commissionPercent * 100) }).returning();
    return res.status(201).json({ ambassador });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return res.status(409).json({ error: "referral_code_exists" });
    throw error;
  }
});
router.patch("/ambassadors/:id", async (req, res) => {
  const active = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!active.success) return res.status(400).json({ error: "invalid_body" });
  const [ambassador] = await db.update(ambassadorsTable).set({ active: active.data.active }).where(eq(ambassadorsTable.id, req.params.id)).returning();
  if (!ambassador) return res.status(404).json({ error: "ambassador_not_found" });
  return res.json({ ambassador });
});

export default router;
