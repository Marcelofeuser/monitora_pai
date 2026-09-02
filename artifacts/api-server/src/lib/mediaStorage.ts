import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Todo o disco de mídia (fotos e vídeos enviados no chat) vive num volume
// persistente do Railway montado no api-server em /data — sem isso, cada
// deploy novo apagaria as mídias (o filesystem do container não é
// persistente por padrão). MEDIA_DIR aponta pra dentro desse volume em
// produção; localmente cai numa pasta do projeto (não commitada) só pra
// não quebrar em dev.
const MEDIA_DIR = process.env.MEDIA_DIR ?? path.join(process.cwd(), "data", "media");

// Extensão <-> mimetype: única fonte de verdade pra validar upload e pra
// servir o Content-Type certo depois. Só os formatos abaixo são aceitos —
// qualquer outro mimetype é rejeitado antes de tocar o disco.
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const PHOTO_MAX_BYTES = 12 * 1024 * 1024; // 12MB
export const VIDEO_MAX_BYTES = 60 * 1024 * 1024; // 60MB
// Limite do multer precisa ser o maior dos dois — o limite específico por
// tipo é conferido depois, na rota.
export const UPLOAD_MAX_BYTES = VIDEO_MAX_BYTES;

export function isAllowedMime(mime: string): boolean {
  return mime in EXTENSION_BY_MIME;
}

export function kindForMime(mime: string): "photo" | "video" | null {
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  return null;
}

export function maxBytesForMime(mime: string): number {
  return mime.startsWith("video/") ? VIDEO_MAX_BYTES : PHOTO_MAX_BYTES;
}

let dirReady: Promise<void> | null = null;
async function ensureDir(): Promise<void> {
  if (!dirReady) {
    dirReady = mkdir(MEDIA_DIR, { recursive: true }).then(() => undefined);
  }
  return dirReady;
}

// Nome de arquivo é sempre um UUID gerado por nós + extensão conhecida —
// nunca deriva de nada que o cliente mande, pra não abrir brecha de path
// traversal (../../etc) nem de sobrescrever arquivo de outra mensagem.
const FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp4|webm|mov)$/;

export function isValidMediaFilename(filename: string): boolean {
  return FILENAME_PATTERN.test(filename);
}

export async function saveMedia(
  buffer: Buffer,
  mimeType: string,
): Promise<{ filename: string; url: string }> {
  const ext = EXTENSION_BY_MIME[mimeType];
  if (!ext) throw new Error("unsupported_media_type");
  await ensureDir();
  const filename = `${randomUUID()}.${ext}`;
  await writeFile(path.join(MEDIA_DIR, filename), buffer);
  return { filename, url: `/api/media/${filename}` };
}

export function mediaFilePath(filename: string): string {
  return path.join(MEDIA_DIR, filename);
}

export async function mediaFileExists(filename: string): Promise<boolean> {
  try {
    await stat(mediaFilePath(filename));
    return true;
  } catch {
    return false;
  }
}

export function contentTypeForFilename(filename: string): string {
  const ext = filename.split(".").pop() ?? "";
  const found = Object.entries(EXTENSION_BY_MIME).find(([, e]) => e === ext);
  return found?.[0] ?? "application/octet-stream";
}
