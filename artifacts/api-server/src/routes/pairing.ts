import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes, randomUUID, createHash, randomInt } from "crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  db,
  pairingTokensTable,
  usersTable,
  childDeviceTokensTable,
  childGuardiansTable,
  subscriptionsTable,
} from "@workspace/db";
import { ensureParentUser } from "../lib/parentUser";
import { getGuardianChildIds, isGuardianOfChild } from "../lib/guardians";
import { z } from "zod/v4";
import { allowPairingAttempt } from "../lib/pairingRateLimit";
import { disconnectDeviceSockets } from "../signaling/revocation";

const router: IRouter = Router();

const PAIRING_TOKEN_TTL_MINUTES = 15;

function generateToken(): string {
  // 24 bytes -> 32 char base64url token. Curto o bastante pra caber num QR
  // pequeno, longo o bastante pra não ser adivinhável.
  return randomBytes(24).toString("base64url");
}

function generatePairingCode(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

const createPairingSchema = z.object({
  childName: z.string().min(1).max(120),
  childAge: z.string().max(10).optional(),
  // LGPD/ECA Digital: consentimento explícito do Responsável pro
  // tratamento de dados da Criança -- z.literal(true) recusa a requisição
  // se o campo vier ausente/false (checkbox não marcado no frontend, ver
  // PairingGenerate.tsx). Sem isso não dá pra provar que o consentimento
  // foi de fato coletado, só que o formulário foi preenchido.
  consent: z.literal(true),
});

/**
 * POST /api/pairing
 * Responsável autenticado cria um perfil de Criança e recebe um código
 * temporário de 8 dígitos para informar no app nativo.
 * Não depende de telefone/SIM — só requer o Responsável autenticado (Clerk).
 */
router.post("/pairing", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ error: "not_authenticated" });
  }
  if (!(await allowPairingAttempt(req, res, "generate", auth.userId))) return;

  const parsed = createPairingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  // Garante que existe uma linha em `users` para este Responsável, com o
  // nome real vindo do Clerk (nunca mais o literal fixo "Responsável" — ver
  // lib/parentUser.ts).
  const parentUser = await ensureParentUser(auth.userId);
  const parentId = parentUser.id;
  const [subscription] = await db.select({ childrenLimit: subscriptionsTable.childrenLimit, status: subscriptionsTable.status, plan: subscriptionsTable.plan })
    .from(subscriptionsTable).where(eq(subscriptionsTable.parentUserId, parentId)).limit(1);
  if (subscription?.plan === "paid" && subscription.status === "active") {
    const children = await getGuardianChildIds(parentId);
    const pendingPairings = await db.select({ id: pairingTokensTable.id }).from(pairingTokensTable).where(and(
      eq(pairingTokensTable.parentId, parentId),
      isNull(pairingTokensTable.usedAt),
      isNull(pairingTokensTable.reconnectChildId),
      gt(pairingTokensTable.expiresAt, new Date()),
    ));
    if (children.length + pendingPairings.length >= subscription.childrenLimit) {
      return res.status(403).json({ error: "children_limit_reached", childrenLimit: subscription.childrenLimit });
    }
  }

  const token = generateToken();
  const pairingCode = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MINUTES * 60 * 1000);

  const [pairing] = await db
    .insert(pairingTokensTable)
    .values({
      token,
      pairingCode,
      parentId,
      childName: parsed.data.childName,
      childAge: parsed.data.childAge,
      // z.literal(true) já garantiu que só chega aqui se o consentimento
      // foi marcado -- carimba o timestamp de verdade, não só um "true".
      consentAcceptedAt: new Date(),
      expiresAt,
    })
    .returning();

  return res.status(201).json({
    token: pairing.token,
    pairingCode: pairing.pairingCode,
    // URL que vai virar o QR code no frontend do Responsável.
    joinUrl: `${process.env.APP_URL ?? ""}/join?token=${pairing.token}`,
    expiresAt: pairing.expiresAt,
  });
});

const reconnectPairingSchema = z.object({
  childId: z.string().min(1),
});

/**
 * POST /api/pairing/reconnect
 * Pedido do Marcelo: se o aparelho da Criança perder a conexão (limpou
 * dados do navegador, trocou de aparelho, etc.), ele quer poder clicar no
 * nome dela — que já existe — e gerar um QR code novo pra RECONECTAR,
 * sem criar outra Criança do zero (o que perderia mensagens, localização,
 * tempo de uso etc., tudo vinculado ao childId original). Mesmo mecanismo
 * de token/QR do /api/pairing normal — só marca reconnectChildId, que o
 * /api/pairing/confirm usa pra saber que não deve criar usuário novo.
 */
router.post("/pairing/reconnect", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ error: "not_authenticated" });
  }
  if (!(await allowPairingAttempt(req, res, "generate", auth.userId))) return;

  const parsed = reconnectPairingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  if (!(await isGuardianOfChild(auth.userId, parsed.data.childId))) {
    return res.status(403).json({ error: "not_the_parent_of_this_child" });
  }
  const [child] = await db.select().from(usersTable).where(eq(usersTable.id, parsed.data.childId)).limit(1);
  if (!child) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const token = generateToken();
  const pairingCode = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MINUTES * 60 * 1000);

  const [pairing] = await db
    .insert(pairingTokensTable)
    .values({
      token,
      pairingCode,
      parentId: auth.userId,
      childName: child.name,
      reconnectChildId: child.id,
      expiresAt,
    })
    .returning();

  return res.status(201).json({
    token: pairing.token,
    pairingCode: pairing.pairingCode,
    joinUrl: `${process.env.APP_URL ?? ""}/join?token=${pairing.token}`,
    expiresAt: pairing.expiresAt,
    childName: child.name,
  });
});

const confirmPairingSchema = z.object({
  token: z.string().min(1).max(256).optional(),
  code: z.string().regex(/^\d{8}$/).optional(),
}).refine((value) => Boolean(value.token) !== Boolean(value.code));

/**
 * POST /api/pairing/confirm
 *
 * Consome o código de 8 dígitos (apps nativos) ou o token QR legado (PWA),
 * criando/reconectando o dispositivo dentro de uma transação.
 * FOR UPDATE serializa confirmações simultâneas da mesma credencial.
 */
router.post("/pairing/confirm", async (req, res) => {
  // Conta também corpos inválidos; a gravação é independente da transação
  // de pareamento para não desaparecer em um rollback.
  const submittedCode = typeof req.body?.code === "string";
  if (!(await allowPairingAttempt(req, res, submittedCode ? "confirm_code" : "confirm"))) return;
  const parsed = confirmPairingSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_body",
      details: parsed.error.flatten(),
    });
  }

  const rawDeviceToken = randomBytes(32).toString("base64url");
  const deviceTokenHash = createHash("sha256")
    .update(rawDeviceToken)
    .digest("hex");

  const result = await db.transaction(async (tx) => {
    // Bloqueia o registro ate o fim da transacao. Uma segunda confirmacao
    // do mesmo token precisa aguardar e depois observar o usedAt atualizado.
    const [pairing] = await tx
      .select()
      .from(pairingTokensTable)
      .where(parsed.data.code
        ? eq(pairingTokensTable.pairingCode, parsed.data.code)
        : eq(pairingTokensTable.token, parsed.data.token!))
      .for("update")
      .limit(1);

    if (
      !pairing ||
      pairing.usedAt !== null ||
      pairing.expiresAt.getTime() <= Date.now()
    ) {
      return { ok: false as const, error: "invalid_or_expired_token" };
    }

    let childUser: typeof usersTable.$inferSelect;
    let revokedDeviceIds: string[] = [];

    if (pairing.reconnectChildId) {
      const [existing] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, pairing.reconnectChildId))
        // Serializa QRs diferentes para a mesma criança, não só o mesmo QR.
        .for("update")
        .limit(1);

      if (!existing || existing.role !== "child") {
        return { ok: false as const, error: "child_no_longer_exists" };
      }

      childUser = existing;

      // Revalida o vínculo no consumo do QR. A permissão pode ter sido
      // removida nos 15 minutos entre a geração e a confirmação.
      if (existing.parentId !== pairing.parentId) {
        const [guardian] = await tx
          .select({ id: childGuardiansTable.id })
          .from(childGuardiansTable)
          .where(and(
            eq(childGuardiansTable.childId, existing.id),
            eq(childGuardiansTable.parentId, pairing.parentId),
          ))
          .for("update")
          .limit(1);
        if (!guardian) {
          return { ok: false as const, error: "not_the_parent_of_this_child" };
        }
      }

      const revoked = await tx
        .update(childDeviceTokensTable)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(childDeviceTokensTable.childId, existing.id),
          isNull(childDeviceTokensTable.revokedAt),
        ))
        .returning({ id: childDeviceTokensTable.id });
      revokedDeviceIds = revoked.map((device) => device.id);
    } else {
      const [created] = await tx
        .insert(usersTable)
        .values({
          id: randomUUID(),
          role: "child",
          name: pairing.childName,
          parentId: pairing.parentId,
        })
        .returning();

      childUser = created;
    }

    // Marca o token como consumido na mesma transacao da criacao do perfil
    // e da credencial. Se qualquer etapa falhar, tudo sofre rollback.
    const [consumed] = await tx
      .update(pairingTokensTable)
      .set({
        usedAt: new Date(),
        resultingChildUserId: childUser.id,
      })
      .where(eq(pairingTokensTable.id, pairing.id))
      .returning({ id: pairingTokensTable.id });

    if (!consumed) {
      throw new Error("Falha ao consumir o token de pareamento.");
    }

    // O responsavel que criou a crianca e owner. Um responsavel adicional
    // que reconecta um dispositivo continua sendo guardian.
    const guardianRole =
      childUser.parentId === pairing.parentId ? "owner" : "guardian";

    await tx
      .insert(childGuardiansTable)
      .values({
        childId: childUser.id,
        parentId: pairing.parentId,
        role: guardianRole,
        consentAcceptedAt: pairing.consentAcceptedAt ?? undefined,
      })
      .onConflictDoNothing({
        target: [
          childGuardiansTable.childId,
          childGuardiansTable.parentId,
        ],
      });

    // O token bruto sera entregue uma unica vez ao dispositivo.
    // No banco fica apenas o hash SHA-256.
    await tx.insert(childDeviceTokensTable).values({
      childId: childUser.id,
      tokenHash: deviceTokenHash,
    });

    return {
      ok: true as const,
      childUserId: childUser.id,
      parentId: pairing.parentId,
      childName: childUser.name,
      revokedDeviceIds,
    };
  });

  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  // Só desconecta depois do COMMIT: rollback preserva credenciais e sockets.
  for (const deviceId of result.revokedDeviceIds) disconnectDeviceSockets(deviceId);

  return res.status(200).json({
    childUserId: result.childUserId,
    parentId: result.parentId,
    childName: result.childName,
    deviceToken: rawDeviceToken,
  });
});

export default router;
