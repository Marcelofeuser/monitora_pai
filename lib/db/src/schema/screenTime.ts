import { pgTable, text, timestamp, integer, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Configuração de tempo de uso por criança — uma linha por criança
// (childId já é a chave primária, não precisa de uuid próprio).
// dailyLimitMinutes nulo = sem limite (padrão, até o Responsável definir).
export const screenTimeSettingsTable = pgTable("screen_time_settings", {
  childId: text("child_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  dailyLimitMinutes: integer("daily_limit_minutes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Minutos de uso por dia — a Criança manda um "heartbeat" a cada minuto
// enquanto o app dela está aberto e em primeiro plano (ver
// PairingJoin.tsx); cada heartbeat soma 1 minuto na linha do dia atual.
// "date" é texto "YYYY-MM-DD" (não um tipo date do Postgres) pra evitar
// qualquer ambiguidade de fuso horário entre o que o servidor calcula e o
// que fica gravado — sempre a data corrida no fuso do servidor.
export const screenTimeUsageTable = pgTable(
  "screen_time_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: text("child_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    minutesUsed: integer("minutes_used").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [unique("screen_time_usage_child_date_unique").on(table.childId, table.date)],
);

// Presença de linha = criança bloqueada manualmente pelo Responsável
// ("bloqueio temporário", item 11). Ausência de linha = desbloqueada. O
// limite diário de tempo (dailyLimitMinutes) não usa esta tabela — é
// resolvido comparando screen_time_usage do dia atual contra o limite, na
// hora de responder o status; não precisa "desbloquear" nada à meia-noite.
export const childLocksTable = pgTable("child_locks", {
  childId: text("child_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  lockedAt: timestamp("locked_at").defaultNow().notNull(),
  lockedByParentId: text("locked_by_parent_id")
    .notNull()
    .references(() => usersTable.id),
});

export const insertScreenTimeSettingsSchema = createInsertSchema(screenTimeSettingsTable).omit({
  updatedAt: true,
});
export type ScreenTimeSettings = typeof screenTimeSettingsTable.$inferSelect;
export type ScreenTimeUsage = typeof screenTimeUsageTable.$inferSelect;
export type ChildLock = typeof childLocksTable.$inferSelect;
export type InsertScreenTimeSettings = z.infer<typeof insertScreenTimeSettingsSchema>;
