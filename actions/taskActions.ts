"use server";

import { Role, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/projectAccess";
import { getTaskStatusLabel } from "@/lib/projectLabels";
import { createProjectLog } from "@/lib/projectLogs";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type CreateTaskInput = {
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  status?: TaskStatus;
};

type UpdateTaskInput = {
  id: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assigneeId?: string | null;
};

function normalize(input: string) {
  return input.trim();
}

async function getUserOrError(): Promise<
  ActionResult<{ id: string; role: Role; name: string }>
> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  return {
    success: true,
    data: { id: user.id, role: user.role, name: user.name },
  };
}

async function isValidAssignee(assigneeId: string) {
  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { role: true, isActive: true },
  });

  return Boolean(assignee?.isActive && assignee.role !== Role.REQUESTER);
}

export async function createTask(
  input: CreateTaskInput,
): Promise<ActionResult<string>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (auth.data.role === Role.REQUESTER) {
    return { success: false, error: "Sem permissao" };
  }

  if (!input.projectId || !input.title?.trim()) {
    return { success: false, error: "Dados invalidos" };
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    input.projectId,
  );

  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  if (input.assigneeId && !(await isValidAssignee(input.assigneeId))) {
    return { success: false, error: "Responsavel invalido" };
  }

  const task = await prisma.task.create({
    data: {
      projectId: input.projectId,
      title: normalize(input.title),
      description: input.description?.trim() || null,
      assigneeId: input.assigneeId ?? null,
      status: input.status ?? TaskStatus.TODO,
    },
  });

  await createProjectLog({
    projectId: input.projectId,
    message: `Tarefa "${task.title}" criada.`,
    authorName: auth.data.name,
    isInternal: true,
  });

  revalidatePath("/kanban");
  revalidatePath("/projetos");
  revalidatePath("/logs");

  return { success: true, data: task.id };
}

export async function updateTask(
  input: UpdateTaskInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!input.id) {
    return { success: false, error: "Tarefa invalida" };
  }

  const task = await prisma.task.findUnique({
    where: { id: input.id },
    select: { assigneeId: true, projectId: true, status: true, title: true },
  });

  if (!task) {
    return { success: false, error: "Tarefa nao encontrada" };
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    task.projectId,
  );

  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  if (
    auth.data.role !== Role.COORDINATOR &&
    auth.data.role !== Role.DEV_GLOBAL &&
    task.assigneeId !== auth.data.id
  ) {
    return { success: false, error: "Sem permissao" };
  }

  if (input.assigneeId && !(await isValidAssignee(input.assigneeId))) {
    return { success: false, error: "Responsavel invalido" };
  }

  const nextTitle = input.title ? normalize(input.title) : undefined;
  // undefined leaves the field untouched, null clears it.
  const nextDescription =
    input.description === undefined
      ? undefined
      : input.description?.trim() || null;
  const nextStatus = input.status;
  const nextAssigneeId = input.assigneeId;

  await prisma.task.update({
    where: { id: input.id },
    data: {
      title: nextTitle,
      description: nextDescription,
      status: nextStatus,
      assigneeId: nextAssigneeId,
    },
  });

  if (nextStatus && nextStatus !== task.status) {
    await createProjectLog({
      projectId: task.projectId,
      message: `Tarefa "${task.title}" atualizada. Status: ${getTaskStatusLabel(task.status)} -> ${getTaskStatusLabel(nextStatus)}.`,
      authorName: auth.data.name,
      isInternal: true,
    });
  }

  revalidatePath("/kanban");
  revalidatePath("/projetos");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}

export async function deleteTask(taskId: string): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (
    auth.data.role !== Role.COORDINATOR &&
    auth.data.role !== Role.DEV_GLOBAL
  ) {
    return { success: false, error: "Sem permissao" };
  }

  if (!taskId) {
    return { success: false, error: "Tarefa invalida" };
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, projectId: true },
  });

  if (!task) {
    return { success: false, error: "Tarefa nao encontrada" };
  }

  await prisma.task.delete({ where: { id: taskId } });

  await createProjectLog({
    projectId: task.projectId,
    message: `Tarefa "${task.title}" removida.`,
    authorName: auth.data.name,
    isInternal: true,
  });

  revalidatePath("/kanban");
  revalidatePath("/projetos");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}

export async function listTasksByProject(projectId: string): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      description: string | null;
      status: TaskStatus;
      assigneeId: string | null;
      assigneeName: string | null;
      createdAt: Date;
    }>
  >
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!projectId) {
    return { success: false, error: "Projeto invalido" };
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    projectId,
  );

  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      assigneeId: true,
      assignee: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: tasks.map(({ assignee, ...task }) => ({
      ...task,
      assigneeName: assignee?.name ?? null,
    })),
  };
}
