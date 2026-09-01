import { pgTable, text, timestamp, uuid, pgEnum, jsonb } from "drizzle-orm/pg-core";
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
  childId: uuid("child_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  contactUserId: uuid("contact_user_id").references(() => usersTable.id),
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
});

export const insertContactSchema = createInsertSchema(contactsTable).omit({
  id: true,
  requestedAt: true,
  decidedAt: true,
});
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contactsTable.$inferSelect;
