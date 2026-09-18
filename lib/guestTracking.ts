import { prisma } from "@/lib/prisma";
import {
  hashToken,
  isValidTokenFormat,
} from "@/lib/publicRequest";
import { parseMultiValue } from "@/lib/requestForm";

// Read side of the public pages. The token is the only credential, so every
// query starts from it and nothing else about the project is looked up by id.

export async function getPendingByToken(token: string) {
  if (!isValidTokenFormat(token)) return null;

  const pending = await prisma.pendingGuestRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { title: true, email: true, name: true, expiresAt: true },
  });

  if (!pending || pending.expiresAt < new Date()) return null;

  return pending;
}

export async function getTrackedProject(token: string) {
  if (!isValidTokenFormat(token)) return null;

  const project = await prisma.project.findUnique({
    where: { trackingToken: token },
    select: {
      id: true,
      title: true,
      description: true,
      justification: true,
      status: true,
      priority: true,
      createdAt: true,
      dueDate: true,
      requester: { select: { name: true } },
      requestValues: {
        select: {
          value: true,
          field: { select: { label: true, isSystem: true, fieldType: true } },
        },
      },
      logs: {
        where: { isInternal: false },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          message: true,
          authorName: true,
          createdAt: true,
          attachments: {
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              fileType: true,
              fileSize: true,
            },
          },
        },
      },
    },
  });

  if (!project) return null;

  const customFields = project.requestValues
    .filter((entry) => !entry.field.isSystem && entry.value)
    .map((entry) => ({
      label: entry.field.label,
      value:
        entry.field.fieldType === "MULTI_SELECT"
          ? parseMultiValue(entry.value).join(", ") || entry.value
          : entry.value,
    }));

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    justification: project.justification,
    status: project.status,
    priority: project.priority,
    createdAt: project.createdAt,
    dueDate: project.dueDate,
    requesterName: project.requester.name,
    customFields,
    messages: project.logs,
  };
}
