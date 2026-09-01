import { pgTable, text, timestamp, uuid, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const planEnum = pgEnum("plan", ["free", "paid"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
]);

// REGRA DE OURO: a assinatura trava "quantas crianças este Responsável monitora",
// nunca "quem pode falar com quem". Um contato aprovado (tia, avó, amigo) nunca
// precisa de assinatura própria só para conversar com a criança monitorada.
// Toda checagem de billing deve fazer JOIN aqui via parentUserId — NUNCA via
// a tabela contacts ou conversations.
export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentUserId: uuid("parent_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  plan: planEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  childrenLimit: integer("children_limit").notNull().default(1),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptionsTable.$inferSelect;
