import { Router, type IRouter, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";
import { requireContactAuth, type ContactAuthedRequest } from "../middlewares/contactAuth";
import { canReact, isAllowedReaction, setReaction, type ChatScope } from "../lib/chatExtras";

const router: IRouter = Router();

// 1.1: reação com emoji. Mesmo handler pros três tipos de login
// (Responsável/Clerk, Criança/X-Child-Token, Contato/X-Contact-Token).
// Corpo: { emoji: "❤️" | null }. null (ou o mesmo emoji de antes, quem
// decide é o app) remove a reação.
async function handleReaction(userId: string, scope: ChatScope, req: Request, res: Response) {
  const messageId = String(req.params.messageId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return res.status(400).json({ error: "invalid_message_id" });

  const raw = (req.body as Record<string, unknown> | undefined)?.emoji;
  const emoji = typeof raw === "string" && raw.length > 0 ? raw : null;
  if (emoji && !isAllowedReaction(emoji)) return res.status(400).json({ error: "invalid_reaction" });

  if (!(await canReact(userId, scope, messageId))) return res.status(403).json({ error: "not_allowed" });

  await setReaction(userId, scope, messageId, emoji);
  return res.json({ ok: true, messageId, emoji });
}

function scopeOf(req: Request): ChatScope | null {
  const s = req.params.scope;
  return s === "direct" || s === "group" ? s : null;
}

/** POST /api/reactions/:scope/:messageId — Responsável (Clerk). */
router.post("/reactions/:scope/:messageId", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });
  const scope = scopeOf(req);
  if (!scope) return res.status(400).json({ error: "invalid_scope" });
  return handleReaction(auth.userId, scope, req, res);
});

/** POST /api/child/reactions/:scope/:messageId — Criança. */
router.post("/child/reactions/:scope/:messageId", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return res.status(400).json({ error: "invalid_scope" });
  return handleReaction(req.childId as string, scope, req, res);
});

/** POST /api/contact/reactions/:scope/:messageId — Contato. */
router.post("/contact/reactions/:scope/:messageId", requireContactAuth, async (req: ContactAuthedRequest, res) => {
  const scope = scopeOf(req);
  if (!scope) return res.status(400).json({ error: "invalid_scope" });
  return handleReaction(req.contactUserId as string, scope, req, res);
});

export default router;
