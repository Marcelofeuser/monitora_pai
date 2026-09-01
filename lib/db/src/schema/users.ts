import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["parent", "child"]);
export const authProviderEnum = pgEnum("auth_provider", ["email", "google", "apple"]);

export const usersTable = pgTable("users", {
  // TEXT, não uuid: para role='parent' este id É o Clerk userId (ex.:
  // "user_3Ij4IMDV8TvM0BHZI6VVg9Zldeu") — o Responsável nunca tem uma conta
  // interna separada da conta Clerk. Para role='child' o id é gerado pela
  // aplicação (crypto.randomUUID(), ver routes/pairing.ts) já que a Criança
  // não tem Clerk. Colocar isso como `uuid` quebrava todo insert de
  // Responsável (Postgres rejeitava o userId do Clerk com "invalid input
  // syntax for type uuid").
  id: text("id").primaryKey(),
  role: userRoleEnum("role").notNull(),
  name: text("name").notNull(),
  // Nullable de propósito: a conta da Criança nunca depende de telefone/SIM.
  // O vínculo com o Responsável é sempre via pairing_tokens (ver pairing.ts).
  phone: text("phone"),
  email: text("email").unique(),
  authProvider: authProviderEnum("auth_provider"),
  // Aponta para o Responsável quando role = 'child'. Nulo para Responsáveis.
  parentId: text("parent_id"),
  onboardingCompleted: text("onboarding_completed").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
