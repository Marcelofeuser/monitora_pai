import { clerkClient } from "@clerk/express";
import { db, usersTable, type User } from "@workspace/db";

/**
 * Obtém o nome que será exibido para o responsável.
 *
 * Prioridade:
 * 1. Nome + sobrenome cadastrados no Clerk;
 * 2. Username do Clerk;
 * 3. E-mail principal, caso o perfil ainda não possua nome.
 *
 * Nunca retorna o texto fixo "Responsável".
 */
function getParentDisplayName(clerkUser: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  emailAddresses: Array<{ emailAddress: string }>;
}): string {
  const fullName = [clerkUser.firstName, clerkUser.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  if (fullName) {
    return fullName;
  }

  const username = clerkUser.username?.trim();

  if (username) {
    return username;
  }

  const email = clerkUser.emailAddresses[0]?.emailAddress?.trim();

  if (email) {
    return email;
  }

  throw new Error(
    "Não foi possível criar o perfil do responsável: cadastre um nome ou e-mail no perfil.",
  );
}

/**
 * Garante que o usuário autenticado possua uma linha como responsável.
 *
 * O nome é sincronizado a cada chamada com o Clerk. Portanto:
 * - perfis antigos salvos como "Responsável" serão corrigidos;
 * - alterações de nome feitas no Clerk serão refletidas automaticamente;
 * - o literal fixo "Responsável" nunca é gravado novamente.
 */
export async function ensureParentUser(userId: string): Promise<User> {
  const clerkUser = await clerkClient.users.getUser(userId);

  const name = getParentDisplayName({
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
    username: clerkUser.username,
    emailAddresses: clerkUser.emailAddresses,
  });

  const [parentUser] = await db
    .insert(usersTable)
    .values({
      id: userId,
      role: "parent",
      name,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        role: "parent",
        name,
      },
    })
    .returning();

  if (!parentUser) {
    throw new Error("Não foi possível criar ou atualizar o responsável.");
  }

  return parentUser;
}