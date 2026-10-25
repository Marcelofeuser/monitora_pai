import { pgTable, text, timestamp, uuid, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const vouchersTable = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull(),
  discountType: text("discount_type").notNull(), // percent | fixed
  discountValue: integer("discount_value").notNull(), // percent points or BRL cents
  maxRedemptions: integer("max_redemptions"),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").notNull().default(true),
  stripeCouponId: text("stripe_coupon_id"),
  createdBy: text("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("vouchers_code_unique").on(table.code)]);

export const ambassadorsTable = pgTable("ambassadors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  referralCode: text("referral_code").notNull(),
  commissionBps: integer("commission_bps").notNull().default(0),
  fixedBenefitCents: integer("fixed_benefit_cents").notNull().default(0),
  benefitDescription: text("benefit_description"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("ambassadors_referral_code_unique").on(table.referralCode)]);

export const ambassadorCommissionsTable = pgTable("ambassador_commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ambassadorId: uuid("ambassador_id").notNull().references(() => ambassadorsTable.id),
  parentUserId: text("parent_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  stripeInvoiceId: text("stripe_invoice_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("accrued"), // accrued | paid | reversed
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("ambassador_commissions_invoice_unique").on(table.stripeInvoiceId)]);
