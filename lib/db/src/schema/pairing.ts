import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Um pairing_token é gerado quando o Responsável cadastra o perfil da Criança
// e precisa de um QR code para vincular o aparelho dela.
// Não depende de telefone/SIM: só precisa de câmera + internet no aparelho da Criança.
export const pairingTokensTable = pgTable("pairing_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  // TEXT: referencia usersTable.id, que agora é text (Clerk userId pro
  // Responsável). Ver comentário em schema/users.ts.
  parentId: text("parent_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  childName: text("child_name").notNull(),
  childAge: text("child_age"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  // Preenchido depois que a Criança escaneia e confirma o vínculo.
  resultingChildUserId: text("resulting_child_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPairingTokenSchema = createInsertSchema(pairingTokensTable).omit({
  id: true,
  createdAt: true,
  usedAt: true,
  resultingChildUserId: true,
});
export type InsertPairingToken = z.infer<typeof insertPairingTokenSchema>;
export type PairingToken = typeof pairingTokensTable.$inferSelect;
