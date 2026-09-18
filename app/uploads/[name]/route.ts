import { Role } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessProject } from "@/lib/projectAccess";
import { serveUpload, UPLOAD_URL_PREFIX } from "@/lib/uploads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return new Response("Nao autenticado", { status: 401 });
  }

  const fileUrl = `${UPLOAD_URL_PREFIX}${name}`;
  // Same answer for "missing" and "forbidden" so names are not probeable.
  const notFound = () => new Response("Arquivo nao encontrado", { status: 404 });

  // A file of a conversation message...
  const message = await prisma.projectLogAttachment.findFirst({
    where: { fileUrl },
    select: {
      fileName: true,
      log: { select: { projectId: true, isInternal: true } },
    },
  });

  if (message) {
    const allowed =
      !(message.log.isInternal && user.role === Role.REQUESTER) &&
      (await canAccessProject(user.id, user.role, message.log.projectId));
    return allowed ? serveUpload(name, message.fileName) : notFound();
  }

  // ...or of a task (internal work: never for requesters).
  const task = await prisma.taskAttachment.findFirst({
    where: { fileUrl },
    select: { fileName: true, task: { select: { projectId: true } } },
  });

  if (
    task &&
    user.role !== Role.REQUESTER &&
    (await canAccessProject(user.id, user.role, task.task.projectId))
  ) {
    return serveUpload(name, task.fileName);
  }

  return notFound();
}
