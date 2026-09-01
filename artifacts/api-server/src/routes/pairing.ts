import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { randomBytes, randomUUID } from "crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db, pairingTokensTable, usersTable } from "@workspace/db";
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

  // Garante que existe uma linha em `users` para este Responsável (idempotente).
  const [parentUser] = await db
    .insert(usersTable)
    .values({ id: auth.userId, role: "parent", name: "Responsável" })
    .onConflictDoNothing({ target: usersTable.id })
    .returning();

  const parentId = parentUser?.id ?? auth.userId;

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

  const [childUser] = await db
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

  await db
    .update(pairingTokensTable)
    .set({ usedAt: new Date(), resultingChildUserId: childUser.id })
    .where(eq(pairingTokensTable.id, pairing.id));

  return res.status(200).json({
    childUserId: childUser.id,
    parentId: pairing.parentId,
    childName: childUser.name,
  });
});

export default router;
