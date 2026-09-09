import { eq, and } from "drizzle-orm";
import { db, usersTable, contactsTable } from "@workspace/db";
import { isGuardianOfChild } from "./guardians";

export type CallAuthResult =
  | { ok: true; childId: string | null }
  | { ok: false; reason: "not_found" | "not_authorized" | "video_not_allowed" };

/**
 * Confere se `callerId` pode ligar pra `calleeId` -- os três pares do
 * produto (pedido do Marcelo, 09/09: "todos os pares"): Responsável<->
 * Criança (mesma regra do canal privado, via isGuardianOfChild -- ver
 * lib/guardians.ts), Responsável<->Contato aprovado (mesma regra do "Meu
 * Chat", ver getOrCreateParentContactConversation em routes/conversations.ts)
 * e Criança<->Contato aprovado (mesma regra do chat espelhado), com a
 * checagem extra de contactsTable.restrictions (allowVideo/allowAudio) que
 * já existia no schema mas nunca tinha sido lida/escrita em lugar nenhum do
 * código -- aqui vira a checagem real de "esse Contato pode ligar pra essa
 * Criança".
 *
 * Responsável<->Responsável, Contato<->Contato e Criança<->Criança NÃO são
 * suportados -- fora do escopo do produto, sempre retorna not_authorized.
 *
 * childId no retorno de sucesso é só informativo (útil pra quem chama
 * precisar saber de qual criança é a rede, ex: registrar o histórico) --
 * nulo quando não há um lado "criança" no par (não existe hoje já que os
 * três pares em escopo sempre envolvem uma Criança direta ou indiretamente
 * via o Contato, mas o tipo fica preparado caso isso mude).
 */
export async function authorizeCall(callerId: string, calleeId: string): Promise<CallAuthResult> {
  if (callerId === calleeId) return { ok: false, reason: "not_authorized" };

  const [caller, callee] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, callerId)).limit(1).then((r) => r[0]),
    db.select().from(usersTable).where(eq(usersTable.id, calleeId)).limit(1).then((r) => r[0]),
  ]);
  if (!caller || !callee) return { ok: false, reason: "not_found" };

  const parentSide = caller.role === "parent" ? caller : callee.role === "parent" ? callee : null;
  const childSide = caller.role === "child" ? caller : callee.role === "child" ? callee : null;
  const contactSide = caller.role === "contact" ? caller : callee.role === "contact" ? callee : null;

  // Responsável <-> Criança
  if (parentSide && childSide && caller.role !== callee.role) {
    const allowed = await isGuardianOfChild(parentSide.id, childSide.id);
    return allowed ? { ok: true, childId: childSide.id } : { ok: false, reason: "not_authorized" };
  }

  // Responsável <-> Contato aprovado
  if (parentSide && contactSide && caller.role !== callee.role) {
    const [row] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.contactUserId, contactSide.id), eq(contactsTable.status, "approved")))
      .limit(1);
    if (!row) return { ok: false, reason: "not_authorized" };
    const allowed = await isGuardianOfChild(parentSide.id, row.childId);
    return allowed ? { ok: true, childId: row.childId } : { ok: false, reason: "not_authorized" };
  }

  // Criança <-> Contato aprovado
  if (childSide && contactSide && caller.role !== callee.role) {
    const [row] = await db
      .select()
      .from(contactsTable)
      .where(
        and(
          eq(contactsTable.childId, childSide.id),
          eq(contactsTable.contactUserId, contactSide.id),
          eq(contactsTable.status, "approved"),
        ),
      )
      .limit(1);
    if (!row) return { ok: false, reason: "not_authorized" };
    // Nulo/undefined = permitido (mesma convenção de nullable-pra-
    // retrocompatibilidade usada em relation/consentAcceptedAt em
    // contactsTable) -- só bloqueia quando o Responsável marcou false
    // explicitamente.
    if (row.restrictions?.allowVideo === false || row.restrictions?.allowAudio === false) {
      return { ok: false, reason: "video_not_allowed" };
    }
    return { ok: true, childId: childSide.id };
  }

  return { ok: false, reason: "not_authorized" };
}
