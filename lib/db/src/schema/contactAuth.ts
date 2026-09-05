import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { contactsTable } from "./contacts";

// Convite de acesso pra um Contato aprovado (mãe, avó, tia etc) virar um
// participante de verdade do app -- mesma ideia do pairing_tokens da
// Criança (ver schema/pairing.ts), mas pro lado do Contato. Resolve a
// limitação já documentada em schema/groups.ts ("depende de um jeito do
// contato entrar no app primeiro -- ainda não construído"): o Responsável
// gera o link/QR com o nome já preenchido; a pessoa confirma (podendo
// mudar o nome) e ganha conta própria (usersTable role='contact') + token
// de dispositivo (contactDeviceTokensTable), igual à Criança.
export const contactInviteTokensTable = pgTable("contact_invite_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  parentId: text("parent_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  childId: text("child_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contactsTable.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  resultingContactUserId: text("resulting_contact_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Token de dispositivo do Contato -- mesmo princípio de
// child_device_tokens (schema/location.ts): só o hash é guardado, o valor
// bruto vai pro aparelho dele no momento da confirmação do convite e
// nunca mais é reemitido. Ver middlewares/contactAuth.ts.
export const contactDeviceTokensTable = pgTable("contact_device_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactUserId: text("contact_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const insertContactInviteTokenSchema = createInsertSchema(contactInviteTokensTable).omit({
  id: true,
  createdAt: true,
  usedAt: true,
  resultingContactUserId: true,
});
export type InsertContactInviteToken = z.infer<typeof insertContactInviteTokenSchema>;
export type ContactInviteToken = typeof contactInviteTokensTable.$inferSelect;
export type ContactDeviceTokenRow = typeof contactDeviceTokensTable.$inferSelect;
