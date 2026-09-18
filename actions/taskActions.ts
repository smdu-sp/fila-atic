"use server";

import { Role, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/projectAccess";
import { formatDueDate, parseDateInput, toDateInput } from "@/lib/dueDate";
import { getTaskStatusLabel } from "@/lib/projectLabels";
import { touchProject } from "@/lib/projectStatus";
import { ensureTeamMember } from "@/lib/projectTeam";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type CreateTaskInput = {
  projectId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  status?: TaskStatus;
  // "YYYY-MM-DD"; null or empty means no due date.
  dueDate?: string | null;
};

type UpdateTaskInput = {
  id: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assigneeId?: string | null;
  // "YYYY-MM-DD" sets it, null clears it, undefined leaves it.
  dueDate?: string | null;
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

const isManager = (role: Role) =>
  role === Role.COORDINATOR || role === Role.DEV_GLOBAL;

// Handing a task to someone also puts them on the project team, so that is
// reserved to managers. A restricted developer may only keep a task for
// themselves or leave it without an owner.
function mayAssign(auth: { id: string; role: Role }, assigneeId: string | null) {
  return isManager(auth.role) || assigneeId === null || assigneeId === auth.id;
}

async function findAssignee(assigneeId: string) {
  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { name: true, role: true, isActive: true },
  });

  return assignee?.isActive && assignee.role !== Role.REQUESTER
    ? assignee
    : null;
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

  if (input.status && !Object.values(TaskStatus).includes(input.status)) {
    return { success: false, error: "Status invalido" };
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    input.projectId,
  );

  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  const due = parseDateInput(input.dueDate);
  if (!due.ok) {
    return { success: false, error: "Prazo invalido" };
  }

  const assigneeId = input.assigneeId || null;
  if (assigneeId) {
    if (!mayAssign(auth.data, assigneeId)) {
      return { success: false, error: "Sem permissao para atribuir" };
    }
    if (!(await findAssignee(assigneeId))) {
      return { success: false, error: "Responsavel invalido" };
    }
  }

  const task = await prisma.$transaction(async (tx) => {
    const created = await tx.task.create({
      data: {
        projectId: input.projectId,
        title: normalize(input.title),
        description: input.description?.trim() || null,
        assigneeId,
        status: input.status ?? TaskStatus.TODO,
        dueDate: due.value ?? null,
      },
    });

    if (assigneeId) {
      await ensureTeamMember(tx, input.projectId, assigneeId, auth.data.name);
    }

    await tx.projectLog.create({
      data: {
        projectId: input.projectId,
        message: `Tarefa "${created.title}" criada.`,
        authorName: auth.data.name,
        isInternal: true,
      },
    });

    await touchProject(tx, input.projectId);
    return created;
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

  if (input.status && !Object.values(TaskStatus).includes(input.status)) {
    return { success: false, error: "Status invalido" };
  }

  const task = await prisma.task.findUnique({
    where: { id: input.id },
    select: {
      assigneeId: true,
      assignee: { select: { name: true } },
      projectId: true,
      status: true,
      title: true,
      description: true,
      dueDate: true,
    },
  });

  if (!task) {
    return { success: false, error: "Tarefa nao encontrada" };
  }

  const due = parseDateInput(input.dueDate);
  if (!due.ok) {
    return { success: false, error: "Prazo invalido" };
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    task.projectId,
  );

  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  if (!isManager(auth.data.role) && task.assigneeId !== auth.data.id) {
    return { success: false, error: "Sem permissao" };
  }

  // undefined leaves the assignee alone, null clears it.
  let newAssignee: { name: string } | null | undefined;
  if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
    if (!mayAssign(auth.data, input.assigneeId)) {
      return { success: false, error: "Sem permissao para atribuir" };
    }
    if (input.assigneeId) {
      newAssignee = await findAssignee(input.assigneeId);
      if (!newAssignee) {
        return { success: false, error: "Responsavel invalido" };
      }
    } else {
      newAssignee = null;
    }
  }

  const nextTitle = input.title ? normalize(input.title) : undefined;
  // undefined leaves the field untouched, null clears it.
  const nextDescription =
    input.description === undefined
      ? undefined
      : input.description?.trim() || null;
  const nextStatus = input.status;

  const changes: string[] = [];
  if (nextTitle !== undefined && nextTitle !== task.title) {
    changes.push(`Titulo: "${task.title}" -> "${nextTitle}"`);
  }
  if (
    nextDescription !== undefined &&
    nextDescription !== (task.description ?? null)
  ) {
    changes.push("Descricao alterada");
  }
  if (nextStatus && nextStatus !== task.status) {
    changes.push(
      `Status: ${getTaskStatusLabel(task.status)} -> ${getTaskStatusLabel(nextStatus)}`,
    );
  }
  if (
    due.value !== undefined &&
    toDateInput(due.value) !== toDateInput(task.dueDate)
  ) {
    const label = (date: Date | null) =>
      date ? formatDueDate(date) : "sem prazo";
    changes.push(`Prazo: ${label(task.dueDate)} -> ${label(due.value)}`);
  }
  if (newAssignee !== undefined) {
    changes.push(
      `Responsavel: ${task.assignee?.name ?? "sem responsavel"} -> ${newAssignee?.name ?? "sem responsavel"}`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: input.id },
      data: {
        title: nextTitle,
        description: nextDescription,
        status: nextStatus,
        assigneeId: input.assigneeId,
        dueDate: due.value,
      },
    });

    if (newAssignee && input.assigneeId) {
      await ensureTeamMember(tx, task.projectId, input.assigneeId, auth.data.name);
    }

    if (changes.length) {
      await tx.projectLog.create({
        data: {
          projectId: task.projectId,
          message: `Tarefa "${nextTitle ?? task.title}" atualizada. ${changes.join(" | ")}.`,
          authorName: auth.data.name,
          isInternal: true,
        },
      });
    }

    await touchProject(tx, task.projectId);
  });

  revalidatePath("/kanban");
  revalidatePath("/projetos");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}

export async function deleteTask(taskId: string): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!isManager(auth.data.role)) {
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

  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: taskId } });

    await tx.projectLog.create({
      data: {
        projectId: task.projectId,
        message: `Tarefa "${task.title}" removida.`,
        authorName: auth.data.name,
        isInternal: true,
      },
    });

    await touchProject(tx, task.projectId);
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
      dueDate: Date | null;
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
      dueDate: true,
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

// Every task assigned to the current user, across projects.
export async function listMyTasks(): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      description: string | null;
      status: TaskStatus;
      assigneeId: string | null;
      assigneeName: string | null;
      dueDate: Date | null;
      createdAt: Date;
      projectId: string;
      projectTitle: string;
    }>
  >
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (auth.data.role === Role.REQUESTER) {
    return { success: false, error: "Sem permissao" };
  }

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: auth.data.id,
      // a restricted developer only works on projects they belong to
      ...(auth.data.role === Role.DEV_RESTRICTED
        ? { project: { developers: { some: { userId: auth.data.id } } } }
        : {}),
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      assigneeId: true,
      dueDate: true,
      createdAt: true,
      project: { select: { id: true, title: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return {
    success: true,
    data: tasks.map(({ project, ...task }) => ({
      ...task,
      assigneeName: auth.data.name,
      projectId: project.id,
      projectTitle: project.title,
    })),
  };
}
