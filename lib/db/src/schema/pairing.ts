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
  // Presente só nos pareamentos de RECONEXÃO (POST /api/pairing/reconnect):
  // aponta pra uma Criança que já existe, em vez de criar uma nova. Pedido
  // do Marcelo: se a conexão do aparelho da Criança cair (localStorage
  // apagado, trocou de aparelho, etc.), ele quer poder gerar um QR novo
  // "pra essa mesma criança" clicando no nome dela — sem isso, cada
  // reconexão criava um usuário novo do zero, perdendo histórico de
  // mensagens, tempo de uso, localização etc. (tudo isso é vinculado ao
  // childId). Nulo = pareamento normal, cria Criança nova (fluxo de sempre).
  reconnectChildId: text("reconnect_child_id").references(() => usersTable.id, { onDelete: "cascade" }),
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
