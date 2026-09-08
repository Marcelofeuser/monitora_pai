import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Estatística de Convites (item 2 do pedido original: card "Excluídos").
// Contato excluído é hard delete de verdade (LGPD, ver DELETE
// /api/contacts/:id) -- a linha em `contacts` some, então não dá pra
// contar quantos foram excluídos olhando o estado atual da tabela. Este
// log guarda só o mínimo pra alimentar o contador: NENHUM dado do Contato
// (nome, telefone, relation etc) fica registrado aqui, só que "uma
// exclusão aconteceu, desta Criança, nesta hora" -- mantém o espírito do
// hard delete (não é um histórico com dados pessoais, é uma contagem
// anônima). onDelete cascade: se a própria Criança for excluída, o log
// dela some junto (não faz sentido sem a Criança pra mostrar a estatística).
export const contactDeletionEventsTable = pgTable("contact_deletion_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: text("child_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ContactDeletionEvent = typeof contactDeletionEventsTable.$inferSelect;
