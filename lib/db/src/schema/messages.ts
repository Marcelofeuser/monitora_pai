import { pgTable, text, timestamp, uuid, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const messageTypeEnum = pgEnum("message_type", ["text", "audio", "video", "photo"]);

export const conversationsTable = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
  participantAId: text("participant_a_id")
    .notNull()
    .references(() => usersTable.id),
  participantBId: text("participant_b_id")
    .notNull()
    .references(() => usersTable.id),
  // Regra central do produto: só é espelhada se NÃO for a conversa
  // Responsável <-> Criança. Toda conversa Criança <-> contato aprovado é espelhada.
  isParentChildPrivate: boolean("is_parent_child_private").notNull().default(false),
  // Quando a última notificação push foi mandada pro Responsável sobre
  // atividade nesta conversa. Nulo = nunca notificado. Usado pra decidir a
  // cadência do item 10 do pedido: notifica na hora quando a conversa
  // começa, depois no máximo a cada 30min enquanto ela continuar ativa
  // (nunca por mensagem individual). Ver lib/notify.ts.
  lastNotifiedAt: timestamp("last_notified_at"),
  // Mesma ideia, só que pro lado da Criança: quando ela foi notificada por
  // último de o Responsável ter mandado mensagem nesta conversa. Coluna
  // separada de lastNotifiedAt de propósito — são dois relógios de debounce
  // independentes (a Criança mandar mensagem não "usa" a cota de
  // notificação do Responsável, e vice-versa). Ver notifyChildOfActivity em
  // lib/notify.ts.
  lastNotifiedChildAt: timestamp("last_notified_child_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messagesTable = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
  senderId: text("sender_id")
    .notNull()
    .references(() => usersTable.id),
  type: messageTypeEnum("type").notNull(),
  contentUrl: text("content_url"),
  textContent: text("text_content"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Registro de para qual Responsável cada mensagem foi espelhada, e quando.
export const mirrorLogTable = pgTable("mirror_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messagesTable.id, { onDelete: "cascade" }),
  // TEXT: referencia usersTable.id (text). Ver comentário em schema/users.ts.
  mirroredToParentId: text("mirrored_to_parent_id")
    .notNull()
    .references(() => usersTable.id),
  mirroredAt: timestamp("mirrored_at").defaultNow().notNull(),
});

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({
  id: true,
  createdAt: true,
});
export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
export type MirrorLog = typeof mirrorLogTable.$inferSelect;
