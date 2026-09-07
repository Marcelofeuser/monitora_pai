import { pgTable, text, timestamp, uuid, pgEnum, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Item 13 do pedido: mais de um Responsável pode enxergar a mesma Criança
// (ex: Marcelo + Veronica). Antes só existia usersTable.parentId (1 dono
// por Criança). Esta tabela é a fonte de verdade de QUEM enxerga cada
// Criança agora -- pode ter N linhas por childId. usersTable.parentId
// continua existindo e apontando pro dono original (quem pareou a
// Criança) por retrocompatibilidade (usado no canal privado 1:1 de quem
// pareou, por exemplo) -- toda rota nova/corrigida usa
// isGuardianOfChild()/getGuardianChildIds() em vez de comparar direto com
// parentId. Ver artifacts/api-server/src/lib/guardians.ts.
export const guardianRoleEnum = pgEnum("guardian_role", ["owner", "guardian"]);

export const childGuardiansTable = pgTable(
  "child_guardians",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: text("child_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    parentId: text("parent_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: guardianRoleEnum("role").notNull().default("guardian"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("child_guardians_child_parent_unique").on(table.childId, table.parentId)],
);

// Convite pra um 2o (3o...) Responsável entrar no MESMO espaço -- ao
// aceitar, ganha acesso a TODAS as crianças que o Responsável convidante
// já enxerga naquele momento (dono ou guardian), não uma criança
// específica. Mesmo mecanismo dos outros dois convites do app (pairing da
// Criança em schema/pairing.ts, contact_invite_tokens em
// schema/contactAuth.ts) -- ver comentário lá.
export const guardianInviteTokensTable = pgTable("guardian_invite_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  invitedByParentId: text("invited_by_parent_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  resultingParentId: text("resulting_parent_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChildGuardianSchema = createInsertSchema(childGuardiansTable).omit({
  id: true,
  createdAt: true,
});
export const insertGuardianInviteTokenSchema = createInsertSchema(guardianInviteTokensTable).omit({
  id: true,
  createdAt: true,
  usedAt: true,
  resultingParentId: true,
});
export type ChildGuardian = typeof childGuardiansTable.$inferSelect;
export type InsertChildGuardian = z.infer<typeof insertChildGuardianSchema>;
export type GuardianInviteToken = typeof guardianInviteTokensTable.$inferSelect;
export type InsertGuardianInviteToken = z.infer<typeof insertGuardianInviteTokenSchema>;
