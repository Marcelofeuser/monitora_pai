import { pgTable, text, timestamp, uuid, pgEnum, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const contactStatusEnum = pgEnum("contact_status", [
  "pending",
  "approved",
  "denied",
  "revoked",
]);

// Um contato só passa a poder conversar com a Criança depois que o Responsável aprova.
// Regra crítica: billing NUNCA consulta esta tabela — ver subscriptions.ts.
export const contactsTable = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
  childId: text("child_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  contactUserId: text("contact_user_id").references(() => usersTable.id),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  status: contactStatusEnum("status").notNull().default("pending"),
  restrictions: jsonb("restrictions").$type<{
    allowVideo?: boolean;
    allowAudio?: boolean;
    allowPhotos?: boolean;
  }>(),
  requestedAt: timestamp("requested_at").defaultNow().notNull(),
  decidedAt: timestamp("decided_at"),
  // Long-press na bolinha do contato > favoritar (pedido do Marcelo): vira
  // avatar em estrela na lista (ver shape='star' em Avatar, App.tsx).
  // "Bloquear" não ganhou coluna nova -- reaproveita status="revoked", que
  // já existia (ver PATCH /contacts/:id/decision).
  isFavorite: boolean("is_favorite").notNull().default(false),
  // "Função" escolhida pelo Responsável na hora de adicionar o contato
  // (amigo, primo, tio, avó, etc — pedido do Marcelo, item 7). Texto livre
  // (rótulo em português já pronto pra exibir, ex: "Amigo(a)") em vez de
  // enum -- é só uma etiqueta informativa, diferente de
  // parentRelationshipEnum (que é sobre o Responsável, não o Contato).
  // Nula pra contatos criados antes desta coluna existir.
  relation: text("relation"),
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({
  id: true,
  requestedAt: true,
  decidedAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
