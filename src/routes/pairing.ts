import { eq } from "drizzle-orm";
import { db } from "../db";
import { pairingTokens, childGuardians, childDeviceTokens } from "../db/schema";
import { ensureGuardian } from "../services/guardianService";
import crypto from "crypto";

export function registerPairingRoutes(app: any) {
  app.post("/pairing/confirm", async (req: any, res: any, next: any) => {
    try {
      const { token, pairingCode, deviceName, guardianId, guardianEmail, guardianName } = req.body;
      
      if (!token || !guardianId || !guardianEmail) {
        return res.status(400).json({ 
          error: "invalid_payload", 
          message: "Token e dados do responsável são obrigatórios." 
        });
      }

      const result = await db.transaction(async (tx) => {
        const [tokenRecord] = await tx
          .select()
          .from(pairingTokens)
          .where(eq(pairingTokens.token, token))
          .for("update");

        if (!tokenRecord) {
          const err: any = new Error("Token de pareamento não encontrado.");
          err.statusCode = 404;
          throw err;
        }

        if (tokenRecord.usedAt) {
          const err: any = new Error("Este token de pareamento já foi utilizado.");
          err.statusCode = 409;
          throw err;
        }

        if (new Date() > new Date(tokenRecord.expiresAt)) {
          const err: any = new Error("Token de pareamento expirado.");
          err.statusCode = 410;
          throw err;
        }

        if (pairingCode && tokenRecord.pairingCode && tokenRecord.pairingCode !== pairingCode) {
          const err: any = new Error("Código numérico de pareamento incorreto.");
          err.statusCode = 400;
          throw err;
        }

        await ensureGuardian(guardianId, guardianEmail, guardianName, tx);

        await tx.insert(childGuardians).values({
          childId: tokenRecord.childId,
          guardianId,
          role: "primary",
          createdAt: new Date()
        }).onConflictDoNothing();

        const rawDeviceToken = crypto.randomBytes(32).toString("hex");
        const hashedDeviceToken = crypto.createHash("sha256").update(rawDeviceToken).digest("hex");

        await tx.insert(childDeviceTokens).values({
          childId: tokenRecord.childId,
          tokenHash: hashedDeviceToken,
          deviceName: deviceName || "Dispositivo Pareado",
          lastUsedAt: new Date(),
          createdAt: new Date()
        });

        await tx.update(pairingTokens)
          .set({ usedAt: new Date() })
          .where(eq(pairingTokens.id, tokenRecord.id));

        return { childId: tokenRecord.childId, deviceToken: rawDeviceToken };
      });

      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      next(error);
    }
  });
}
