import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes, randomUUID, createHash } from "crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db, pairingTokensTable, usersTable, childDeviceTokensTable } from "@workspace/db";
import { ensureParentUser } from "../lib/parentUser";
import { z } from "zod/v4";

const router: IRouter = Router();

const PAIRING_TOKEN_TTL_MINUTES = 15;

function generateToken(): string {
  // 24 bytes -> 32 char base64url token. Curto o bastante pra caber num QR
  // pequeno, longo o bastante pra não ser adivinhável.
  return randomBytes(24).toString("base64url");
}

const createPairingSchema = z.object({
  childName: z.string().min(1).max(120),
  childAge: z.string().max(10).optional(),
});

/**
 * POST /api/pairing
 * Responsável autenticado cria um perfil de Criança e recebe um token de
 * pareamento para gerar o QR code no frontend.
 * Não depende de telefone/SIM — só requer o Responsável autenticado (Clerk).
 */
router.post("/pairing", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  const parsed = createPairingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  // Garante que existe uma linha em `users` para este Responsável, com o
  // nome real vindo do Clerk (nunca mais o literal fixo "Responsável" — ver
  // lib/parentUser.ts).
  const parentUser = await ensureParentUser(auth.userId);
  const parentId = parentUser.id;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MINUTES * 60 * 1000);

  const [pairing] = await db
    .insert(pairingTokensTable)
    .values({
      token,
      parentId,
      childName: parsed.data.childName,
      childAge: parsed.data.childAge,
      expiresAt,
    })
    .returning();

  return res.status(201).json({
    token: pairing.token,
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

  const parsed = reconnectPairingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [child] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, parsed.data.childId), eq(usersTable.parentId, auth.userId)))
    .limit(1);
  if (!child) return res.status(403).json({ error: "not_the_parent_of_this_child" });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + PAIRING_TOKEN_TTL_MINUTES * 60 * 1000);

  const [pairing] = await db
    .insert(pairingTokensTable)
    .values({
      token,
      parentId: auth.userId,
      childName: child.name,
      reconnectChildId: child.id,
      expiresAt,
    })
    .returning();

  return res.status(201).json({
    token: pairing.token,
    joinUrl: `${process.env.APP_URL ?? ""}/join?token=${pairing.token}`,
    expiresAt: pairing.expiresAt,
    childName: child.name,
  });
});

const confirmPairingSchema = z.object({
  token: z.string().min(1),
});

/**
 * POST /api/pairing/confirm
 * Chamado pelo aparelho da Criança depois de escanear o QR code.
 * Valida o token (existe, não expirou, não foi usado) e cria a conta da
 * Criança já vinculada ao Responsável via parentId.
 */
router.post("/pairing/confirm", async (req, res) => {
  const parsed = confirmPairingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [pairing] = await db
    .select()
    .from(pairingTokensTable)
    .where(
      and(
        eq(pairingTokensTable.token, parsed.data.token),
        isNull(pairingTokensTable.usedAt),
        gt(pairingTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!pairing) {
    // Não diferenciar "não existe" de "expirado" na resposta — evita
    // dar dica útil pra quem estiver tentando forçar tokens.
    return res.status(400).json({ error: "invalid_or_expired_token" });
  }

  // Reconexão (ver /api/pairing/reconnect): reaproveita a Criança que já
  // existe em vez de criar outra — só o dispositivo muda, a identidade
  // (e todo o histórico vinculado ao childId) continua a mesma.
  let childUser: typeof usersTable.$inferSelect;
  if (pairing.reconnectChildId) {
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, pairing.reconnectChildId))
      .limit(1);
    if (!existing) {
      return res.status(400).json({ error: "child_no_longer_exists" });
    }
    childUser = existing;
  } else {
    const [created] = await db
      .insert(usersTable)
      .values({
        // usersTable.id agora é TEXT (sem default no banco — ver
        // schema/users.ts), porque pra role='parent' o id precisa ser
        // exatamente o Clerk userId. Pra role='child' geramos o id aqui.
        id: randomUUID(),
        role: "child",
        name: pairing.childName,
        parentId: pairing.parentId,
      })
      .returning();
    childUser = created;
  }

  await db
    .update(pairingTokensTable)
    .set({ usedAt: new Date(), resultingChildUserId: childUser.id })
    .where(eq(pairingTokensTable.id, pairing.id));

  // A Criança não tem conta Clerk — este é o único momento em que ela
  // recebe uma credencial. O aparelho dela guarda o token bruto (nunca
  // reemitido); o servidor só guarda o hash. Ver middlewares/childAuth.ts.
  const rawDeviceToken = randomBytes(32).toString("base64url");
  const deviceTokenHash = createHash("sha256").update(rawDeviceToken).digest("hex");
  await db.insert(childDeviceTokensTable).values({
    childId: childUser.id,
    tokenHash: deviceTokenHash,
  });

  return res.status(200).json({
    childUserId: childUser.id,
    parentId: pairing.parentId,
    childName: childUser.name,
    deviceToken: rawDeviceToken,
  });
});

export default router;
