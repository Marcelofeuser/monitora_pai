import { clerkClient } from "@clerk/express";
import { db, usersTable, type User } from "@workspace/db";

/**
 * Garante que existe uma linha em `users` para este Responsável, sempre com
 * o nome real vindo do Clerk (nunca mais o literal fixo "Responsável" que
 * tínhamos antes — bug reportado pelo Marcelo: a Criança via "converse com
 * o Responsável" em vez do nome de verdade).
 *
 * Chamado toda vez que o Responsável interage com uma rota que precisa da
 * linha dele em `users` (pairing, /api/me, etc.) — por isso faz um UPDATE
 * do nome a cada chamada (onConflictDoUpdate), não só um insert-once: se o
 * Responsável mudar o nome no Clerk, ou se ele já tinha uma linha antiga
 * com o literal "Responsável" gravado, ela se autocorrige na próxima vez
 * que ele passar por aqui — sem precisar de migração manual de dados.
 */
export async function ensureParentUser(userId: string): Promise<User> {
  const clerkUser = await clerkClient.users.getUser(userId);
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    clerkUser.username ||
    clerkUser.emailAddresses[0]?.emailAddress ||
    "Responsável";

  const [parentUser] = await db
    .insert(usersTable)
    .values({ id: userId, role: "parent", name })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { name },
    })
    .returning();

  return parentUser;
}
