import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// "contact" adicionado pro Contato aprovado (mãe, avó, tia etc) que
// aceita o convite de acesso (ver schema/contactAuth.ts) e ganha conta
// própria pra conversar de verdade com a Criança dentro do app.
export const userRoleEnum = pgEnum("user_role", ["parent", "child", "contact"]);
export const authProviderEnum = pgEnum("auth_provider", ["email", "google", "apple"]);
// Como a Criança deve se referir ao Responsável (pedido do Marcelo: "pai,
// mae, avó, tio, etc" em vez do genérico "Responsável" sempre). Só faz
// sentido pra role='parent' — nulo pra Criança, e nulo pro Responsável até
// ele escolher em Configurações (cai no rótulo "Responsável" no frontend
// nesse caso). Os valores ficam neutros de gênero/artigo aqui de
// propósito (avo_m/avo_f em vez de "avô"/"avó" com acento) — quem decide
// o rótulo e o artigo certo ("o Pai", "a Mãe"...) é o frontend (ver
// lib/relationship.ts na PWA), não o banco.
export const parentRelationshipEnum = pgEnum("parent_relationship", [
  "pai",
  "mae",
  "avo_m",
  "avo_f",
  "tio",
  "tia",
  "responsavel",
]);

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
  // Só usado quando role = 'parent'. Ver comentário em parentRelationshipEnum.
  relationship: parentRelationshipEnum("relationship"),
  onboardingCompleted: text("onboarding_completed").default("false"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
