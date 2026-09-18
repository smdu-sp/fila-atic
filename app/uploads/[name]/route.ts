import { Role } from "@prisma/client";
import { promises as fs } from "fs";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessProject } from "@/lib/projectAccess";
import {
  getStoredUploadPath,
  getUploadContentType,
  UPLOAD_URL_PREFIX,
} from "@/lib/uploads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return new Response("Nao autenticado", { status: 401 });
  }

  const filePath = getStoredUploadPath(name);
  if (!filePath) {
    return new Response("Arquivo nao encontrado", { status: 404 });
  }

  const attachment = await prisma.projectLogAttachment.findFirst({
    where: { fileUrl: `${UPLOAD_URL_PREFIX}${name}` },
    select: {
      fileName: true,
      log: { select: { projectId: true, isInternal: true } },
    },
  });

  // Same response for "missing" and "forbidden" so ids are not probeable.
  const allowed =
    attachment &&
    !(attachment.log.isInternal && user.role === Role.REQUESTER) &&
    (await canAccessProject(user.id, user.role, attachment.log.projectId));

  if (!attachment || !allowed) {
    return new Response("Arquivo nao encontrado", { status: 404 });
  }

  let content: Buffer;
  try {
    content = await fs.readFile(filePath);
  } catch {
    return new Response("Arquivo nao encontrado", { status: 404 });
  }

  const { contentType, inline } = getUploadContentType(name);
  const disposition = inline ? "inline" : "attachment";

  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(content.length),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-cache",
    },
  });
}
