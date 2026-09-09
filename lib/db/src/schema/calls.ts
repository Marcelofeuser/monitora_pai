import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Ligação de voz/vídeo (pedido do Marcelo, 09/09: "vamos a ligacao e video
// chamadas"). Uma linha por TENTATIVA de chamada (append-only, mesmo padrão
// de messagesTable) -- não é uma "conversa" com estado mutável em cima,
// é o registro histórico + a âncora de autoridade do servidor pra resolver
// corrida (dois ligando ao mesmo tempo) e reconciliar depois de um restart
// do processo de sinalização (deploy no Railway mata estado em memória).
//
// callerId/calleeId: TEXT referenciando usersTable.id -- funciona pros três
// papéis (Responsável, Criança, Contato) porque todos vivem na mesma tabela
// (ver comentário em schema/users.ts: pro Responsável, o id É o Clerk
// userId). Mesmo padrão de conversationsTable.participantAId/participantBId
// em schema/messages.ts.
export const callStatusEnum = pgEnum("call_status", ["ringing", "active", "ended"]);
export const callEndReasonEnum = pgEnum("call_end_reason", [
  "hangup", // alguém desligou depois de atender
  "declined", // quem recebeu recusou explicitamente
  "missed", // ninguém atendeu a tempo (timeout do servidor)
  "busy", // quem recebeu já estava em outra chamada (ringing/active)
  "canceled", // quem ligou desistiu antes de atender
  "failed", // erro técnico (ICE failure, socket caiu sem hangup, etc)
]);

export const callsTable = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  callerId: text("caller_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  calleeId: text("callee_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  status: callStatusEnum("status").notNull().default("ringing"),
  createdAt: timestamp("created_at").defaultNow().notNull(), // quando o convite foi criado
  answeredAt: timestamp("answered_at"),
  endedAt: timestamp("ended_at"),
  endReason: callEndReasonEnum("end_reason"),
});

export const insertCallSchema = createInsertSchema(callsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof callsTable.$inferSelect;
