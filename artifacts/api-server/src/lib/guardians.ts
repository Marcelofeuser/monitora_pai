import { eq, and, inArray } from "drizzle-orm";
import { db, usersTable, childGuardiansTable } from "@workspace/db";

// Item 13 do pedido: mais de um Responsável pode enxergar a mesma Criança
// (ex: Marcelo + Veronica). usersTable.parentId continua sendo o "dono"
// original (quem pareou a Criança); childGuardiansTable guarda TODOS que
// tem acesso, dono incluso (ver ensureOwnerGuardian). Toda checagem de
// autorizacao "sou eu o responsavel dessa crianca?" deve usar
// isGuardianOfChild -- comparar direto com usersTable.parentId deixa
// qualquer guardian adicional de fora.

/**
 * Garante que um Responsavel tem uma linha em child_guardians pra essa
 * Crianca -- chamado quando a Crianca e pareada/reconectada
 * (routes/pairing.ts) e quando um convite de Responsavel e aceito
 * (routes/guardians.ts). onConflictDoNothing: idempotente, pode chamar
 * quantas vezes quiser sem duplicar.
 */
export async function ensureGuardian(
  childId: string,
  parentId: string,
  role: "owner" | "guardian" = "owner",
  // LGPD/ECA Digital: quando o Responsável de fato consentiu (checkbox no
  // momento da criação do pareamento ou do aceite do convite -- ver
  // routes/pairing.ts e routes/guardians.ts). onConflictDoNothing significa
  // que isso só é gravado na PRIMEIRA vez que esta linha é criada — nunca
  // sobrescreve um consentimento já registrado, e fica ausente (null) nos
  // caminhos de fallback (reconexão, isGuardianOfChild) onde não há
  // consentimento novo sendo dado agora.
  consentAcceptedAt?: Date,
): Promise<void> {
  await db
    .insert(childGuardiansTable)
    .values({ childId, parentId, role, consentAcceptedAt })
    .onConflictDoNothing({ target: [childGuardiansTable.childId, childGuardiansTable.parentId] });
}

/**
 * Confirma se `parentId` tem acesso a `childId` -- via child_guardians OU
 * (fallback pra Criancas pareadas antes desta feature existir, que nunca
 * ganharam a linha 'owner') via usersTable.parentId antigo. No caminho de
 * fallback, ja aproveita pra popular child_guardians, entao da proxima vez
 * cai direto no caminho rapido de cima.
 */
export async function isGuardianOfChild(parentId: string, childId: string): Promise<boolean> {
  const [viaGuardian] = await db
    .select({ id: childGuardiansTable.id })
    .from(childGuardiansTable)
    .where(and(eq(childGuardiansTable.childId, childId), eq(childGuardiansTable.parentId, parentId)))
    .limit(1);
  if (viaGuardian) return true;

  const [child] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, parentId)))
    .limit(1);
  if (child) {
    await ensureGuardian(childId, parentId, "owner");
    return true;
  }
  return false;
}

/**
 * Todas as childIds que esse Responsavel enxerga hoje (dono original OU
 * guardian adicional) -- usado em GET /api/children.
 */
export async function getGuardianChildIds(parentId: string): Promise<string[]> {
  const [viaOwner, viaGuardian] = await Promise.all([
    db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "child"), eq(usersTable.parentId, parentId))),
    db
      .select({ childId: childGuardiansTable.childId })
      .from(childGuardiansTable)
      .where(eq(childGuardiansTable.parentId, parentId)),
  ]);
  const ids = new Set<string>();
  for (const row of viaOwner) ids.add(row.id);
  for (const row of viaGuardian) ids.add(row.childId);
  return [...ids];
}

export type GuardianInfo = { id: string; name: string; role: "owner" | "guardian" };

/**
 * Todos os Responsaveis (dono + guardians) de uma Crianca -- usado na tela
 * "Responsaveis" das Configuracoes e pra notificar/espelhar pra todo mundo
 * (lib/mirror.ts, notifyParentOfGroupMessage em routes/groups.ts).
 */
export async function getGuardiansOfChild(childId: string): Promise<GuardianInfo[]> {
  const [child] = await db.select({ parentId: usersTable.parentId }).from(usersTable).where(eq(usersTable.id, childId)).limit(1);
  if (child?.parentId) await ensureGuardian(childId, child.parentId, "owner");

  const rows = await db
    .select({ parentId: childGuardiansTable.parentId, role: childGuardiansTable.role })
    .from(childGuardiansTable)
    .where(eq(childGuardiansTable.childId, childId));
  if (rows.length === 0) return [];

  const parents = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, rows.map((r) => r.parentId)));
  const nameById = new Map(parents.map((p) => [p.id, p.name]));
  return rows.map((r) => ({ id: r.parentId, name: nameById.get(r.parentId) ?? "Responsável", role: r.role }));
}
