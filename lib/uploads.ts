import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

// Files live outside /public and are served by app/uploads/[name]/route.ts,
// which checks the session and project access before streaming them.
export const UPLOAD_DIR = path.join(process.cwd(), "storage", "uploads");
export const UPLOAD_URL_PREFIX = "/uploads/";

export const MAX_UPLOAD_FILES = 3;
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  ".zip": "application/zip",
};

const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

export function getUploadContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const contentType = ALLOWED_TYPES[extension];

  return {
    contentType: contentType ?? "application/octet-stream",
    inline: contentType ? INLINE_TYPES.has(contentType) : false,
  };
}

export function validateUploads(files: File[]): string | null {
  if (files.length > MAX_UPLOAD_FILES) {
    return `Envie no maximo ${MAX_UPLOAD_FILES} arquivos por mensagem`;
  }

  for (const file of files) {
    if (!(path.extname(file.name).toLowerCase() in ALLOWED_TYPES)) {
      return `Tipo de arquivo nao permitido: ${file.name}`;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      return `Arquivo acima de ${MAX_UPLOAD_SIZE / 1024 / 1024} MB: ${file.name}`;
    }
  }

  return null;
}

export async function saveUploads(files: File[]) {
  if (!files.length) return [];

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  return Promise.all(
    files.map(async (file) => {
      const extension = path.extname(file.name).toLowerCase();
      const baseName = path
        .basename(file.name, path.extname(file.name))
        .replace(/[^a-z0-9-_]+/gi, "_")
        .slice(0, 40);
      const storedName = `${baseName || "arquivo"}-${randomUUID()}${extension}`;

      await fs.writeFile(
        path.join(UPLOAD_DIR, storedName),
        Buffer.from(await file.arrayBuffer()),
      );

      return {
        fileName: file.name,
        fileUrl: `${UPLOAD_URL_PREFIX}${storedName}`,
        fileType: file.type || null,
        fileSize: Math.trunc(file.size),
      };
    }),
  );
}

export function getStoredUploadPath(storedName: string) {
  if (path.basename(storedName) !== storedName) return null;
  return path.join(UPLOAD_DIR, storedName);
}

export async function deleteUploads(fileUrls: string[]) {
  await Promise.all(
    fileUrls.map(async (fileUrl) => {
      if (!fileUrl.startsWith(UPLOAD_URL_PREFIX)) return;
      const filePath = getStoredUploadPath(
        fileUrl.slice(UPLOAD_URL_PREFIX.length),
      );
      if (!filePath) return;
      await fs.unlink(filePath).catch(() => undefined);
    }),
  );
}

// Streams a stored file with headers that stop the browser from interpreting
// it as a page. Callers must have authorized the access already.
export async function serveUpload(storedName: string, downloadName: string) {
  const filePath = getStoredUploadPath(storedName);
  if (!filePath) {
    return new Response("Arquivo nao encontrado", { status: 404 });
  }

  let content: Buffer;
  try {
    content = await fs.readFile(filePath);
  } catch {
    return new Response("Arquivo nao encontrado", { status: 404 });
  }

  const { contentType, inline } = getUploadContentType(storedName);
  const disposition = inline ? "inline" : "attachment";

  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(content.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-cache",
    },
  });
}
