import { createHash } from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db, childDeviceTokensTable } from "@workspace/db";

// A Criança não tem conta Clerk — só entra via pareamento por QR code (ver
// routes/pairing.ts). O token de dispositivo gerado nesse momento é
// guardado no aparelho dela (localStorage) e mandado no header
// X-Child-Token nas rotas que ela precisa chamar. Aqui a gente valida esse
// token contra o hash salvo no banco e anexa o childId na request.
export type ChildAuthedRequest = Request & { childId?: string };

export const requireChildAuth: RequestHandler = async (
  req: ChildAuthedRequest,
  res: Response,
  next: NextFunction,
) => {
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

  if (!row) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  req.childId = row.childId;
  // Best-effort — não bloqueia a resposta se essa atualização falhar.
  db.update(childDeviceTokensTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(childDeviceTokensTable.id, row.id))
    .catch(() => {});

  return next();
};
