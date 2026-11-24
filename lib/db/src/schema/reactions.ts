import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { messagesTable } from "./messages";
import { groupMessagesTable } from "./groups";

// 1.1: reação com emoji (igual WhatsApp). Uma por pessoa por mensagem --
// trocar o emoji substitui. Exatamente um dos dois alvos é preenchido
// (CHECK message_reactions_one_target na migração 0007).
export const messageReactionsTable = pgTable("message_reactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id").references(() => messagesTable.id, { onDelete: "cascade" }),
  groupMessageId: uuid("group_message_id").references(() => groupMessagesTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type MessageReaction = typeof messageReactionsTable.$inferSelect;
