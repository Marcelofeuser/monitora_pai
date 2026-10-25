import { createHash } from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db, childDeviceTokensTable } from "@workspace/db";

// A Criança autentica com o token emitido no pareamento. Somente tokens
// registrados e ainda não revogados podem acessar as rotas protegidas.
export type ChildAuthedRequest = Request<Record<string, string>> & { childId?: string; childDeviceId?: string };

export const requireChildAuth: RequestHandler = async (
  req: ChildAuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const header = req.headers["x-child-token"];
    const token = Array.isArray(header) ? header[0] : header;

    if (!token) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [row] = await db
      .select()
      .from(childDeviceTokensTable)
      .where(eq(childDeviceTokensTable.tokenHash, tokenHash))
      .limit(1);

    if (!row || row.revokedAt != null) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    req.childId = row.childId;
    req.childDeviceId = row.id;

    // Best-effort: a falha ao registrar o último uso não invalida a sessão.
    void db
      .update(childDeviceTokensTable)
      .set({ lastUsedAt: new Date() })
      .where(eq(childDeviceTokensTable.id, row.id))
      .catch(() => {});

    return next();
  } catch (error) {
    return next(error);
  }
};
