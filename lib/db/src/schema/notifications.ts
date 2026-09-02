import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Assinatura de push do navegador do Responsável (Web Push API), criada
// quando ele liga o toggle "Notificações" em Configurações. Um Responsável
// pode ter mais de uma (vários navegadores/aparelhos logados) — por isso
// não é 1:1 com usersTable, e uma notificação vai pra todas as assinaturas
// dele. O endpoint é único por natureza (é a URL do serviço de push do
// navegador daquele aparelho específico).
// Nullable nos dois — cada linha pertence a UM dos dois lados (Responsável
// OU Criança), nunca aos dois. Começou só com parentUserId (item 10, só o
// Responsável era notificado); ganhou childId depois pra cobrir também a
// Criança sendo notificada quando o Responsável manda mensagem — mesma
// tabela, mesma lógica de envio (webPush.ts), só muda quem é o dono da
// assinatura. Validado na rota (routes/notifications.ts), não aqui.
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentUserId: text("parent_user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  childId: text("child_id").references(() => usersTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscriptionRow = typeof pushSubscriptionsTable.$inferSelect;
