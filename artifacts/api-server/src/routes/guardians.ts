import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes } from "node:crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db, usersTable, guardianInviteTokensTable, childGuardiansTable } from "@workspace/db";
import { z } from "zod/v4";
import { ensureParentUser } from "../lib/parentUser";
import { ensureGuardian, getGuardianChildIds, getGuardiansOfChild } from "../lib/guardians";

const router: IRouter = Router();

const GUARDIAN_INVITE_TTL_DAYS = 7;

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * GET /api/guardians
 * Lista quem tem acesso ao espaco do Responsavel autenticado -- uniao dos
 * Responsaveis de todas as criancas que ele enxerga hoje (dono ou
 * guardian). Usado na tela "Responsaveis" das Configuracoes.
 */
router.get("/guardians", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const childIds = await getGuardianChildIds(auth.userId);
  const byId = new Map<string, { id: string; name: string; role: "owner" | "guardian" }>();
  for (const childId of childIds) {
    const guardians = await getGuardiansOfChild(childId);
    for (const g of guardians) byId.set(g.id, g);
  }
  return res.json([...byId.values()]);
});

/**
 * POST /api/guardians/invite
 * Gera link/QR pra um novo Responsavel entrar no mesmo espaco -- pedido do
 * Marcelo (item 13): "2o responsavel cria conta propria por um link de
 * convite e compartilha o mesmo espaco/mesmas criancas". Ao aceitar, ganha
 * acesso a TODAS as criancas que o convidante enxerga no momento do aceite
 * (ver /api/guardians/invite/:token/accept) -- nao e um convite por
 * crianca especifica.
 */
router.post("/guardians/invite", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  await ensureParentUser(auth.userId);

  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + GUARDIAN_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(guardianInviteTokensTable)
    .values({ token, invitedByParentId: auth.userId, expiresAt })
    .returning();

  return res.status(201).json({
    token: invite.token,
    joinUrl: `${process.env.APP_URL ?? ""}/aceitar-responsavel?token=${invite.token}`,
    expiresAt: invite.expiresAt,
  });
});

/**
 * GET /api/guardians/invite/:token
 * Publico -- quem foi convidado pode ainda nao ter conta nenhuma. So
 * mostra o nome de quem convidou, pra tela de aceite.
 */
router.get("/guardians/invite/:token", async (req, res) => {
  const [invite] = await db
    .select()
    .from(guardianInviteTokensTable)
    .where(
      and(
        eq(guardianInviteTokensTable.token, req.params.token),
        isNull(guardianInviteTokensTable.usedAt),
        gt(guardianInviteTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!invite) return res.status(400).json({ error: "invalid_or_expired_token" });

  const [inviter] = await db.select().from(usersTable).where(eq(usersTable.id, invite.invitedByParentId)).limit(1);
  return res.json({ invitedByName: inviter?.name ?? null, expiresAt: invite.expiresAt });
});

const acceptGuardianInviteSchema = z.object({
  // LGPD/ECA Digital: consentimento explícito de quem está aceitando virar
  // Responsável adicional pro tratamento de dados de TODAS as crianças que
  // vai passar a enxergar -- mesmo z.literal(true) usado em
  // createPairingSchema (routes/pairing.ts). Sem isso não dá pra provar que
  // o consentimento foi de fato coletado nesse ponto de entrada também.
  consent: z.literal(true),
});

/**
 * POST /api/guardians/invite/:token/accept
 * Autenticado (Clerk) -- quem aceita ja logou ou criou conta propria antes
 * de chamar isso (fluxo normal de auth do app; a tela publica so mostra
 * "entre ou crie conta" e chama isso depois -- ver GuardianJoin.tsx).
 * Garante a linha em `users` pro Clerk userId de quem aceitou e vira
 * guardian de TODAS as criancas que o convidante enxerga agora.
 */
router.post("/guardians/invite/:token/accept", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = acceptGuardianInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [invite] = await db
    .select()
    .from(guardianInviteTokensTable)
    .where(
      and(
        eq(guardianInviteTokensTable.token, req.params.token),
        isNull(guardianInviteTokensTable.usedAt),
        gt(guardianInviteTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!invite) return res.status(400).json({ error: "invalid_or_expired_token" });

  if (invite.invitedByParentId === auth.userId) {
    return res.status(400).json({ error: "cannot_accept_own_invite" });
  }

  const newParent = await ensureParentUser(auth.userId);

  const childIds = await getGuardianChildIds(invite.invitedByParentId);
  // z.literal(true) já garantiu que só chega aqui se o consentimento foi
  // marcado -- carimba o timestamp de verdade pra cada criança que este
  // Responsável está ganhando acesso agora (mesmo padrão do POST /pairing).
  const consentAcceptedAt = new Date();
  for (const childId of childIds) {
    await ensureGuardian(childId, newParent.id, "guardian", consentAcceptedAt);
  }

  await db
    .update(guardianInviteTokensTable)
    .set({ usedAt: new Date(), resultingParentId: newParent.id })
    .where(eq(guardianInviteTokensTable.id, invite.id));

  return res.json({ ok: true, childrenCount: childIds.length });
});

/**
 * DELETE /api/guardians/:parentId
 * Remove o acesso de um Responsavel adicional (nunca do proprio -- usar
 * "sair" seria outra rota; nao existe ainda). So pode remover quem NAO e
 * "owner" de nenhuma crianca do espaco -- evita o Responsavel original
 * removido por engano.
 */
router.delete("/guardians/:parentId", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const targetParentId = req.params.parentId;
  if (targetParentId === auth.userId) {
    return res.status(400).json({ error: "cannot_remove_yourself" });
  }

  const childIds = await getGuardianChildIds(auth.userId);
  if (childIds.length === 0) return res.status(403).json({ error: "not_a_guardian_of_any_child" });

  const rows = await db
    .select()
    .from(childGuardiansTable)
    .where(eq(childGuardiansTable.parentId, targetParentId));
  const targetIsGuardianOfOurSpace = rows.some((r) => childIds.includes(r.childId));
  if (!targetIsGuardianOfOurSpace) return res.status(404).json({ error: "not_found" });
  if (rows.some((r) => r.role === "owner")) {
    return res.status(400).json({ error: "cannot_remove_owner" });
  }

  await db.delete(childGuardiansTable).where(eq(childGuardiansTable.parentId, targetParentId));
  return res.json({ ok: true });
});

export default router;
