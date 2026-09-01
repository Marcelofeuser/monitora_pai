import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["parent", "child"]);
export const authProviderEnum = pgEnum("auth_provider", ["email", "google", "apple"]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: userRoleEnum("role").notNull(),
  name: text("name").notNull(),
  // Nullable de propósito: a conta da Criança nunca depende de telefone/SIM.
  // O vínculo com o Responsável é sempre via pairing_tokens (ver pairing.ts).
  phone: text("phone"),
  email: text("email").unique(),
  authProvider: authProviderEnum("auth_provider"),
  // Aponta para o Responsável quando role = 'child'. Nulo para Responsáveis.
  parentId: uuid("parent_id"),
  onboardingCompleted: text("onboarding_completed").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
