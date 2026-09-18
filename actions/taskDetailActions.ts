"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { canAccessProject } from "@/lib/projectAccess";
import { isManagerRole } from "@/lib/roles";
import { MAX_COMMENT_LENGTH } from "@/lib/taskFields";
import {
  deleteUploads,
  saveUploads,
  validateUploads,
} from "@/lib/uploads";
import { Role } from "@prisma/client";

// Comments and files of a task. Tasks are internal work: requesters never see
// them, and everyone else needs access to the project.

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type TaskComment = {
  id: string;
  authorId: string;
  authorName: string;
  message: string;
  createdAt: Date;
};

export type TaskAttachmentItem = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number;
  uploadedById: string;
  uploadedByName: string;
  createdAt: Date;
};

// The person and the task they may work with, or the reason they may not.
async function accessTo(taskId: string) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nao autenticado" } as const;
  if (user.role === Role.REQUESTER) {
    return { ok: false, error: "Sem permissao" } as const;
  }
  if (!taskId) return { ok: false, error: "Tarefa invalida" } as const;

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      title: true,
      projectId: true,
      assigneeId: true,
    },
  });
  if (!task) return { ok: false, error: "Tarefa nao encontrada" } as const;

  if (!(await canAccessProject(user.id, user.role, task.projectId))) {
    return { ok: false, error: "Sem permissao" } as const;
  }

  return { ok: true, user, task } as const;
}

function refresh(projectId: string) {
  revalidatePath("/kanban");
  revalidatePath(`/solicitacoes/${projectId}`);
}

export async function getTaskDetails(
  taskId: string,
): Promise<
  ActionResult<{ comments: TaskComment[]; attachments: TaskAttachmentItem[] }>
> {
  const access = await accessTo(taskId);
  if (!access.ok) return { success: false, error: access.error };

  const [comments, attachments] = await Promise.all([
    prisma.taskComment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        authorId: true,
        authorName: true,
        message: true,
        createdAt: true,
      },
    }),
    prisma.taskAttachment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        fileType: true,
        fileSize: true,
        uploadedById: true,
        uploadedByName: true,
        createdAt: true,
      },
    }),
  ]);

  return { success: true, data: { comments, attachments } };
}

export async function addTaskComment(input: {
  taskId: string;
  message: string;
}): Promise<ActionResult<void>> {
  const access = await accessTo(input.taskId);
  if (!access.ok) return { success: false, error: access.error };

  const message = String(input.message ?? "").trim();
  if (!message) return { success: false, error: "Escreva o comentario" };
  if (message.length > MAX_COMMENT_LENGTH) {
    return {
      success: false,
      error: `Comentario muito longo (ate ${MAX_COMMENT_LENGTH} caracteres)`,
    };
  }

  const { user, task } = access;
  const previous = await prisma.taskComment.findMany({
    where: { taskId: task.id },
    select: { authorId: true },
  });

  await prisma.taskComment.create({
    data: {
      taskId: task.id,
      authorId: user.id,
      authorName: user.name,
      message,
    },
  });

  // whoever owns the task and whoever already took part in the conversation
  await notifyUsers({
    userIds: [
      ...(task.assigneeId ? [task.assigneeId] : []),
      ...previous.map((comment) => comment.authorId),
    ],
    kind: "TASK_COMMENT",
    title: `Novo comentário em "${task.title}"`,
    body: `${user.name}: ${message.length > 120 ? `${message.slice(0, 117)}...` : message}`,
    href: `/kanban?projeto=${task.projectId}`,
    exceptUserId: user.id,
  });

  refresh(task.projectId);
  return { success: true, data: undefined };
}

export async function deleteTaskComment(
  commentId: string,
): Promise<ActionResult<void>> {
  const comment = await prisma.taskComment.findUnique({
    where: { id: String(commentId ?? "") },
    select: { id: true, authorId: true, taskId: true },
  });
  if (!comment) return { success: false, error: "Comentario nao encontrado" };

  const access = await accessTo(comment.taskId);
  if (!access.ok) return { success: false, error: access.error };

  // your own comment, or any if you manage projects
  if (
    comment.authorId !== access.user.id &&
    !isManagerRole(access.user.role)
  ) {
    return { success: false, error: "Sem permissao" };
  }

  await prisma.taskComment.delete({ where: { id: comment.id } });

  refresh(access.task.projectId);
  return { success: true, data: undefined };
}

export async function addTaskAttachments(
  formData: FormData,
): Promise<ActionResult<void>> {
  const taskId = String(formData.get("taskId") ?? "");
  const files = formData
    .getAll("attachments")
    .filter((file): file is File => file instanceof File && file.size > 0);

  const access = await accessTo(taskId);
  if (!access.ok) return { success: false, error: access.error };

  if (files.length === 0) {
    return { success: false, error: "Nenhum arquivo enviado" };
  }

  const uploadError = validateUploads(files);
  if (uploadError) return { success: false, error: uploadError };

  const { user, task } = access;
  const saved = await saveUploads(files);

  await prisma.$transaction(async (tx) => {
    await tx.taskAttachment.createMany({
      data: saved.map((file) => ({
        taskId: task.id,
        ...file,
        uploadedById: user.id,
        uploadedByName: user.name,
      })),
    });

    await tx.projectLog.create({
      data: {
        projectId: task.projectId,
        message: `Anexo(s) adicionado(s) a tarefa "${task.title}": ${saved.map((file) => file.fileName).join(", ")}.`,
        authorName: user.name,
        isInternal: true,
      },
    });
  });

  refresh(task.projectId);
  return { success: true, data: undefined };
}

export async function deleteTaskAttachment(
  attachmentId: string,
): Promise<ActionResult<void>> {
  const attachment = await prisma.taskAttachment.findUnique({
    where: { id: String(attachmentId ?? "") },
    select: { id: true, taskId: true, fileUrl: true, uploadedById: true },
  });
  if (!attachment) return { success: false, error: "Anexo nao encontrado" };

  const access = await accessTo(attachment.taskId);
  if (!access.ok) return { success: false, error: access.error };

  if (
    attachment.uploadedById !== access.user.id &&
    !isManagerRole(access.user.role)
  ) {
    return { success: false, error: "Sem permissao" };
  }

  await prisma.taskAttachment.delete({ where: { id: attachment.id } });
  await deleteUploads([attachment.fileUrl]);

  refresh(access.task.projectId);
  return { success: true, data: undefined };
}
