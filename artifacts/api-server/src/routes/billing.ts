import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  ambassadorsTable, ambassadorCommissionsTable, db, subscriptionsTable,
  vouchersTable,
} from "@workspace/db";
import { ensureParentUser } from "../lib/parentUser";

const router: IRouter = Router();
const STRIPE_VERSION = "2026-03-25.dahlia";

async function stripeRequest(path: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("stripe_not_configured");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const error = payload.error as { message?: string } | undefined;
    throw new Error(error?.message ?? "stripe_request_failed");
  }
  return payload;
}

const checkoutSchema = z.object({
  plan: z.enum(["kids_solo", "kids_duo", "kids_family"]),
  interval: z.enum(["monthly", "quarterly", "annual"]).default("monthly"),
  voucherCode: z.string().trim().max(32).optional(),
  referralCode: z.string().trim().max(32).optional(),
});
router.post("/checkout", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  const priceId = process.env[`STRIPE_PRICE_${parsed.data.plan.toUpperCase()}_${parsed.data.interval.toUpperCase()}`];
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET || !priceId?.startsWith("price_")) {
    return res.status(503).json({ error: "billing_not_configured" });
  }

  const appBase = process.env.AMPARA_APP_URL ?? process.env.APP_URL ?? "https://responsavel.amparakids.com";
  let appUrl: URL;
  try { appUrl = new URL(appBase); } catch { return res.status(503).json({ error: "billing_not_configured" }); }
  if (appUrl.protocol !== "https:" && process.env.NODE_ENV === "production") return res.status(503).json({ error: "billing_not_configured" });

  const user = await clerkClient.users.getUser(auth.userId);
  const email = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress;
  if (!email) return res.status(400).json({ error: "account_email_required" });
  await ensureParentUser(auth.userId);

  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    customer_email: email,
    client_reference_id: auth.userId,
    success_url: `${appUrl.origin}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl.origin}/billing?status=cancelled`,
    "subscription_data[metadata][parentUserId]": auth.userId,
    "subscription_data[metadata][plan]": parsed.data.plan,
    "subscription_data[metadata][billingInterval]": parsed.data.interval,
    "subscription_data[metadata][childrenLimit]": parsed.data.plan === "kids_solo" ? "1" : parsed.data.plan === "kids_duo" ? "2" : "50",
    "subscription_data[metadata][guardiansLimit]": parsed.data.plan === "kids_solo" ? "2" : parsed.data.plan === "kids_duo" ? "3" : "4",
  };

  const ambassadorCode = parsed.data.referralCode?.toUpperCase();
  if (ambassadorCode) {
    const [ambassador] = await db.select().from(ambassadorsTable).where(and(eq(ambassadorsTable.referralCode, ambassadorCode), eq(ambassadorsTable.active, true))).limit(1);
    if (!ambassador) return res.status(400).json({ error: "invalid_referral_code" });
    form["subscription_data[metadata][ambassadorId]"] = ambassador.id;
  }

  const voucherCode = parsed.data.voucherCode?.toUpperCase();
  if (voucherCode) {
    const [voucher] = await db.select().from(vouchersTable).where(and(eq(vouchersTable.code, voucherCode), eq(vouchersTable.active, true))).limit(1);
    if (!voucher || (voucher.expiresAt && voucher.expiresAt.getTime() <= Date.now())) return res.status(400).json({ error: "invalid_voucher" });
    let couponId = voucher.stripeCouponId;
    if (!couponId) {
      const couponFields: Record<string, string> = {
        id: `ampara-${voucher.code}`,
        duration: "once",
        name: `Ampara ${voucher.code}`,
        ...(voucher.discountType === "percent" ? { percent_off: String(voucher.discountValue) } : { amount_off: String(voucher.discountValue), currency: "brl" }),
        ...(voucher.maxRedemptions ? { max_redemptions: String(voucher.maxRedemptions) } : {}),
        ...(voucher.expiresAt ? { redeem_by: String(Math.floor(voucher.expiresAt.getTime() / 1000)) } : {}),
      };
      const coupon = await stripeRequest("coupons", couponFields);
      couponId = String(coupon.id);
      await db.update(vouchersTable).set({ stripeCouponId: couponId }).where(eq(vouchersTable.id, voucher.id));
    }
    form["discounts[0][coupon]"] = couponId;
  }

  try {
    const session = await stripeRequest("checkout/sessions", form);
    if (typeof session.url !== "string") return res.status(502).json({ error: "stripe_checkout_unavailable" });
    return res.json({ url: session.url });
  } catch (error) {
    // Stripe's response text is intentionally never sent to the client.
    return res.status(502).json({ error: error instanceof Error && error.message === "stripe_not_configured" ? "billing_not_configured" : "stripe_checkout_failed" });
  }
});

function verifyStripeSignature(payload: Buffer, header: string | undefined, secret: string): boolean {
  if (!header) return false;
  const parts = header.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value).filter((value): value is string => Boolean(value));
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(payload).digest();
  return signatures.some((signature) => {
    try { const received = Buffer.from(signature, "hex"); return received.length === digest.length && timingSafeEqual(received, digest); }
    catch { return false; }
  });
}

router.post("/webhook", async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !Buffer.isBuffer(req.body) || !verifyStripeSignature(req.body, req.header("stripe-signature"), secret)) {
    return res.status(400).json({ error: "invalid_webhook_signature" });
  }
  let event: { id: string; type: string; data: { object: Record<string, any> } };
  try { event = JSON.parse(req.body.toString("utf8")); } catch { return res.status(400).json({ error: "invalid_webhook_payload" }); }

  if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
    const subscription = event.data.object;
    const parentUserId = String(subscription.metadata?.parentUserId ?? "");
    if (parentUserId) {
      const stripeStatus = String(subscription.status ?? "");
      const status: "active" | "past_due" | "canceled" = stripeStatus === "active" || stripeStatus === "trialing" ? "active" : stripeStatus === "canceled" ? "canceled" : "past_due";
      const [existing] = await db.select({ id: subscriptionsTable.id }).from(subscriptionsTable).where(eq(subscriptionsTable.parentUserId, parentUserId)).limit(1);
      const values = {
        parentUserId,
        plan: subscription.metadata?.plan === "free" ? "free" as const : "paid" as const,
        status,
        childrenLimit: Math.min(50, Math.max(1, Number(subscription.metadata?.childrenLimit) || 1)),
        guardiansLimit: Math.min(4, Math.max(1, Number(subscription.metadata?.guardiansLimit) || 1)),
        stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : null,
        stripeSubscriptionId: String(subscription.id),
        currentPeriodEnd: subscription.current_period_end ? new Date(Number(subscription.current_period_end) * 1000) : null,
      };
      if (existing) await db.update(subscriptionsTable).set(values).where(eq(subscriptionsTable.id, existing.id));
      else await db.insert(subscriptionsTable).values(values);
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const stripeSubscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : String(invoice.parent?.subscription_details?.subscription ?? "");
    const [saved] = stripeSubscriptionId ? await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.stripeSubscriptionId, stripeSubscriptionId)).limit(1) : [];
    if (saved) {
      const remote = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`, { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY ?? ""}`, "Stripe-Version": STRIPE_VERSION } });
      if (remote.ok) {
        const data = await remote.json() as { metadata?: Record<string, string> };
        const ambassadorId = data.metadata?.ambassadorId;
        const amountCents = Number(invoice.amount_paid ?? 0);
        if (ambassadorId && amountCents > 0) {
          const [ambassador] = await db.select().from(ambassadorsTable).where(and(eq(ambassadorsTable.id, ambassadorId), eq(ambassadorsTable.active, true))).limit(1);
          if (ambassador) await db.insert(ambassadorCommissionsTable).values({ ambassadorId, parentUserId: saved.parentUserId, stripeInvoiceId: String(invoice.id), amountCents: Math.round(amountCents * ambassador.commissionBps / 10000) + ambassador.fixedBenefitCents }).onConflictDoNothing();
        }
      }
    }
  }
  return res.json({ received: true, id: event.id });
});

export default router;
