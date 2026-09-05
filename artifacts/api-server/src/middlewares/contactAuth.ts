import { createHash } from "crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { eq } from "drizzle-orm";
import { db, contactDeviceTokensTable } from "@workspace/db";

// Mesmo princípio de middlewares/childAuth.ts: o Contato (mãe, avó, tia
// etc, depois que aceita o convite -- ver routes/contacts.ts) também não
// tem conta Clerk, só o token de dispositivo recebido na confirmação do
// convite. Header próprio (X-Contact-Token) pra não colidir com
// X-Child-Token.
export type ContactAuthedRequest = Request & { contactUserId?: string };

export const requireContactAuth: RequestHandler = async (
  req: ContactAuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  const header = req.headers["x-contact-token"];
  const token = Array.isArray(header) ? header[0] : header;
  if (!token) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await db
    .select()
    .from(contactDeviceTokensTable)
    .where(eq(contactDeviceTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (!row) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  req.contactUserId = row.contactUserId;
  db.update(contactDeviceTokensTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(contactDeviceTokensTable.id, row.id))
    .catch(() => {});

  return next();
};
