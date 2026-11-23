import multer from "multer";
import type { RequestHandler } from "express";
import { isAllowedMime, normalizeMime, UPLOAD_MAX_BYTES } from "../lib/mediaStorage";
import { logger } from "../lib/logger";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedMime(file.mimetype)) {
      logger.warn(`upload rejected: unsupported media type mimetype=${file.mimetype} name=${file.originalname}`);
      cb(new Error("unsupported_media_type"));
      return;
    }
    // Daqui pra frente todas as rotas veem só o tipo canônico (ex.: audio/mp4).
    file.mimetype = normalizeMime(file.mimetype);
    cb(null, true);
  },
});

// Envolve upload.single('file') pra transformar erro do multer (tipo não
// suportado, arquivo grande demais) numa resposta JSON amigável — sem
// isso, o erro caía no handler global de app.ts, que loga e devolve um
// 500 genérico, sem dar pro cliente um motivo pra mostrar pro usuário.
// Se a requisição não for multipart (mensagem só de texto, cliente
// antigo), o multer simplesmente não popula req.file e segue — não quebra
// nada do fluxo existente.
export const uploadSingleMediaFile: RequestHandler = (req, res, next) => {
  upload.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string })?.code;
    const message = err instanceof Error ? err.message : String(err);
    if (message === "unsupported_media_type") {
      return res.status(400).json({ error: "unsupported_media_type" });
    }
    if (code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "file_too_large" });
    }
    return res.status(400).json({ error: "upload_failed" });
  });
};
