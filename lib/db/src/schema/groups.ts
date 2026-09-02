import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { contactsTable } from "./contacts";

// Grupo pertence a UMA criança (item 8 do pedido: grupo é sempre dentro do
// grupo familiar dela) e só existe se o Responsável criou — não tem estado
// "pendente de aprovação" porque só o Responsável pode chamar a rota de
// criação (mesmo raciocínio de contactsTable: ver comentário em
// routes/contacts.ts). A criação em si já É a autorização exigida.
//
// IMPORTANTE (limitação conhecida, documentada no resumo do projeto):
// um "contato" (contactsTable) pode não ter usersTable.id nenhum — hoje
// não existe fluxo de um contato se autenticar e efetivamente mandar
// mensagem num grupo. Este schema guarda quem está autorizado a participar
// do grupo; o chat de grupo em si (mensagens de/para os membros) depende
// de um jeito do contato entrar no app primeiro (ex: link de convite igual
// ao pareamento da criança) — ainda não construído.
export const groupsTable = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: text("child_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdByParentId: text("created_by_parent_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const groupMembersTable = pgTable("group_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contactsTable.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertGroupSchema = createInsertSchema(groupsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groupsTable.$inferSelect;
export type GroupMember = typeof groupMembersTable.$inferSelect;
