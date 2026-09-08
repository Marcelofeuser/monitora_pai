import { Router, type IRouter, type Request } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, parentRelationshipEnum } from "@workspace/db";
import { ensureParentUser } from "../lib/parentUser";
import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";
import { requireContactAuth, type ContactAuthedRequest } from "../middlewares/contactAuth";
import { uploadSingleMediaFile } from "../middlewares/mediaUpload";
import { kindForMime, maxBytesForMime, saveMedia } from "../lib/mediaStorage";
import { z } from "zod/v4";

const router: IRouter = Router();

// BIO (pedido do Marcelo, 08/09): foto + telefone/e-mail/redes sociais,
// mesma forma pros 3 tipos de conta (Responsável, Criança, Contato) --
// ver schema/users.ts (photoUrl, socialLinks). O nome do Responsável fica
// de fora de propósito: é sincronizado com o Clerk a cada chamada (ver
// ensureParentUser) e um PATCH aqui seria sobrescrito na próxima leitura --
// quem quiser trocar o nome do Responsável, troca na conta (Clerk).

const socialLinksSchema = z
  .object({
    instagram: z.string().max(200).optional(),
    whatsapp: z.string().max(200).optional(),
    other: z.string().max(200).optional(),
  })
  .partial();

/**
 * GET /api/me
 * Dados do Responsável autenticado — nome (sempre sincronizado com o
 * Clerk, ver lib/parentUser.ts), o relacionamento escolhido em
 * Configurações, e a BIO (foto, telefone, e-mail, redes sociais).
 */
router.get("/me", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parentUser = await ensureParentUser(auth.userId);
  return res.json({
    id: parentUser.id,
    name: parentUser.name,
    relationship: parentUser.relationship,
    photoUrl: parentUser.photoUrl,
    phone: parentUser.phone,
    email: parentUser.email,
    socialLinks: parentUser.socialLinks,
  });
});

const updateMeSchema = z.object({
  relationship: z.enum(parentRelationshipEnum.enumValues).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  socialLinks: socialLinksSchema.nullable().optional(),
});

/**
 * PATCH /api/me
 * Responsável escolhe como quer ser chamado na tela da Criança e/ou
 * atualiza sua BIO (telefone, e-mail, redes sociais). Todos os campos são
 * opcionais -- manda só o que quer trocar.
 */
router.patch("/me", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const parsed = updateMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  // Garante que a linha existe (mesmo se o Responsável nunca tiver criado
  // um pareamento ainda) antes de atualizar.
  await ensureParentUser(auth.userId);

  const [updated] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, auth.userId))
    .returning();

  return res.json({
    id: updated.id,
    name: updated.name,
    relationship: updated.relationship,
    photoUrl: updated.photoUrl,
    phone: updated.phone,
    email: updated.email,
    socialLinks: updated.socialLinks,
  });
});

/**
 * POST /api/me/photo
 * Foto de perfil do Responsável. Multipart, campo "file", só imagem --
 * mesmo padrão de POST /api/groups/:id/photo (ver routes/groups.ts).
 */
router.post("/me/photo", uploadSingleMediaFile, async (req: Request, res) => {
  const auth = getAuth(req);
  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });

  const file = (req as typeof req & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: "missing_file" });
  if (kindForMime(file.mimetype) !== "photo") return res.status(400).json({ error: "unsupported_media_type" });
  if (file.size > maxBytesForMime(file.mimetype)) return res.status(413).json({ error: "file_too_large" });

  await ensureParentUser(auth.userId);
  const saved = await saveMedia(file.buffer, file.mimetype);
  const [updated] = await db
    .update(usersTable)
    .set({ photoUrl: saved.url })
    .where(eq(usersTable.id, auth.userId))
    .returning();

  return res.json({ photoUrl: updated.photoUrl });
});

const updateChildMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  socialLinks: socialLinksSchema.nullable().optional(),
});

/**
 * GET /api/child/me
 * PATCH /api/child/me
 * BIO da Criança (primeira página do app dela, pedido do Marcelo 08/09):
 * nome, foto, telefone/e-mail/redes sociais opcionais. Autenticado por
 * X-Child-Token (ver middlewares/childAuth.ts) -- ela não tem Clerk.
 */
router.get("/child/me", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const [child] = await db.select().from(usersTable).where(eq(usersTable.id, req.childId!)).limit(1);
  if (!child) return res.status(404).json({ error: "not_found" });
  return res.json({
    id: child.id,
    name: child.name,
    photoUrl: child.photoUrl,
    phone: child.phone,
    email: child.email,
    socialLinks: child.socialLinks,
  });
});

router.patch("/child/me", requireChildAuth, async (req: ChildAuthedRequest, res) => {
  const parsed = updateChildMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [updated] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, req.childId!))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });

  return res.json({
    id: updated.id,
    name: updated.name,
    photoUrl: updated.photoUrl,
    phone: updated.phone,
    email: updated.email,
    socialLinks: updated.socialLinks,
  });
});

router.post("/child/me/photo", requireChildAuth, uploadSingleMediaFile, async (req: ChildAuthedRequest, res) => {
  const file = (req as typeof req & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: "missing_file" });
  if (kindForMime(file.mimetype) !== "photo") return res.status(400).json({ error: "unsupported_media_type" });
  if (file.size > maxBytesForMime(file.mimetype)) return res.status(413).json({ error: "file_too_large" });

  const saved = await saveMedia(file.buffer, file.mimetype);
  const [updated] = await db
    .update(usersTable)
    .set({ photoUrl: saved.url })
    .where(eq(usersTable.id, req.childId!))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });

  return res.json({ photoUrl: updated.photoUrl });
});

const updateContactMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  socialLinks: socialLinksSchema.nullable().optional(),
});

/**
 * GET /api/contact/me
 * PATCH /api/contact/me
 * BIO do Contato (mãe, avó, tia etc) -- mostrada logo depois que ele
 * confirma o convite (pedido do Marcelo 08/09), e reaberta depois pra
 * editar. Mesmo esquema da Criança, autenticado por X-Contact-Token (ver
 * middlewares/contactAuth.ts). "name" aqui é o mesmo texto que fica em
 * contacts.contactName (ver routes/contacts.ts) -- por simplicidade não
 * sincroniza os dois automaticamente nesta rodada; o nome que aparece pro
 * Responsável continua vindo de contacts.contactName.
 */
router.get("/contact/me", requireContactAuth, async (req: ContactAuthedRequest, res) => {
  const [contact] = await db.select().from(usersTable).where(eq(usersTable.id, req.contactUserId!)).limit(1);
  if (!contact) return res.status(404).json({ error: "not_found" });
  return res.json({
    id: contact.id,
    name: contact.name,
    photoUrl: contact.photoUrl,
    phone: contact.phone,
    email: contact.email,
    socialLinks: contact.socialLinks,
  });
});

router.patch("/contact/me", requireContactAuth, async (req: ContactAuthedRequest, res) => {
  const parsed = updateContactMeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
  }

  const [updated] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, req.contactUserId!))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });

  return res.json({
    id: updated.id,
    name: updated.name,
    photoUrl: updated.photoUrl,
    phone: updated.phone,
    email: updated.email,
    socialLinks: updated.socialLinks,
  });
});

router.post("/contact/me/photo", requireContactAuth, uploadSingleMediaFile, async (req: ContactAuthedRequest, res) => {
  const file = (req as typeof req & { file?: Express.Multer.File }).file;
  if (!file) return res.status(400).json({ error: "missing_file" });
  if (kindForMime(file.mimetype) !== "photo") return res.status(400).json({ error: "unsupported_media_type" });
  if (file.size > maxBytesForMime(file.mimetype)) return res.status(413).json({ error: "file_too_large" });

  const saved = await saveMedia(file.buffer, file.mimetype);
  const [updated] = await db
    .update(usersTable)
    .set({ photoUrl: saved.url })
    .where(eq(usersTable.id, req.contactUserId!))
    .returning();
  if (!updated) return res.status(404).json({ error: "not_found" });

  return res.json({ photoUrl: updated.photoUrl });
});

export default router;
