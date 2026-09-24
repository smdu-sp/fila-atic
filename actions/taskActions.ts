"use server";

import { isManagerRole } from "@/lib/roles";
import { ProjectPriority, Role, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/projectAccess";
import { formatDueDate, parseDateInput, toDateInput } from "@/lib/dueDate";
import { getPriorityLabel, getTaskStatusLabel } from "@/lib/projectLabels";
import { resolveTaskLabels } from "@/lib/labelPalette";
import { LABELS_ERROR, normalizeLabels } from "@/lib/taskFields";
import { deleteUploads } from "@/lib/uploads";
import { touchProject } from "@/lib/projectStatus";
import { notifyTaskAssigned } from "@/lib/notifications";
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
  priority?: ProjectPriority;
  labels?: string[];
};

type UpdateTaskInput = {
  id: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  assigneeId?: string | null;
  // "YYYY-MM-DD" sets it, null clears it, undefined leaves it.
  dueDate?: string | null;
  priority?: ProjectPriority;
  labels?: string[];
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

// Handing a task to someone also puts them on the project team, so that is
// reserved to managers. A restricted developer may only keep a task for
// themselves or leave it without an owner.
function mayAssign(auth: { id: string; role: Role }, assigneeId: string | null) {
  return isManagerRole(auth.role) || assigneeId === null || assigneeId === auth.id;
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

async function announceAssignment(
  projectId: string,
  taskTitle: string,
  assigneeId: string,
  actorId: string,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true },
  });
  if (!project) return;

  await notifyTaskAssigned({
    projectId,
    projectTitle: project.title,
    taskTitle,
    userId: assigneeId,
    exceptUserId: actorId,
  });
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

  const priority = input.priority ?? ProjectPriority.MEDIUM;
  if (!Object.values(ProjectPriority).includes(priority)) {
    return { success: false, error: "Prioridade invalida" };
  }

  const labels: ReturnType<typeof normalizeLabels> =
    input.labels === undefined
      ? { ok: true, value: [] }
      : normalizeLabels(input.labels);
  if (!labels.ok) return { success: false, error: LABELS_ERROR };
  const palette = await resolveTaskLabels(labels.value);
  if (!palette.ok) return { success: false, error: palette.error };

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
        priority,
        labels: palette.value,
        // minus the time: ascending order puts new tasks on top of the column
        position: -(Date.now() / 1000),
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

  if (assigneeId) {
    await announceAssignment(input.projectId, task.title, assigneeId, auth.data.id);
  }

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
      priority: true,
      labels: true,
    },
  });

  if (!task) {
    return { success: false, error: "Tarefa nao encontrada" };
  }

  const due = parseDateInput(input.dueDate);
  if (!due.ok) {
    return { success: false, error: "Prazo invalido" };
  }

  if (
    input.priority !== undefined &&
    !Object.values(ProjectPriority).includes(input.priority)
  ) {
    return { success: false, error: "Prioridade invalida" };
  }

  // undefined leaves the labels alone
  const labels =
    input.labels === undefined ? undefined : normalizeLabels(input.labels);
  if (labels && !labels.ok) return { success: false, error: LABELS_ERROR };
  let nextLabels: string[] | undefined;
  if (labels?.ok) {
    const palette = await resolveTaskLabels(labels.value);
    if (!palette.ok) return { success: false, error: palette.error };
    nextLabels = palette.value;
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    task.projectId,
  );

  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  if (!isManagerRole(auth.data.role) && task.assigneeId !== auth.data.id) {
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
  if (input.priority !== undefined && input.priority !== task.priority) {
    changes.push(
      `Prioridade: ${getPriorityLabel(task.priority)} -> ${getPriorityLabel(input.priority)}`,
    );
  }
  if (nextLabels && nextLabels.join("\n") !== task.labels.join("\n")) {
    changes.push(
      `Etiquetas: ${task.labels.join(", ") || "nenhuma"} -> ${nextLabels.join(", ") || "nenhuma"}`,
    );
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
        priority: input.priority,
        labels: nextLabels,
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

  if (newAssignee && input.assigneeId) {
    await announceAssignment(
      task.projectId,
      nextTitle ?? task.title,
      input.assigneeId,
      auth.data.id,
    );
  }

  revalidatePath("/kanban");
  revalidatePath("/projetos");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}

export async function deleteTask(taskId: string): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!isManagerRole(auth.data.role)) {
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

  const files = await prisma.taskAttachment.findMany({
    where: { taskId },
    select: { fileUrl: true },
  });

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

  await deleteUploads(files.map((file) => file.fileUrl));

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
      priority: ProjectPriority;
      labels: string[];
      position: number;
      commentCount: number;
      attachmentCount: number;
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
      priority: true,
      labels: true,
      position: true,
      _count: { select: { comments: true, attachments: true } },
      createdAt: true,
    },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });

  return {
    success: true,
    data: tasks.map(({ assignee, _count, ...task }) => ({
      ...task,
      assigneeName: assignee?.name ?? null,
      commentCount: _count.comments,
      attachmentCount: _count.attachments,
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
      priority: ProjectPriority;
      labels: string[];
      position: number;
      commentCount: number;
      attachmentCount: number;
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
      priority: true,
      labels: true,
      position: true,
      _count: { select: { comments: true, attachments: true } },
      createdAt: true,
      project: { select: { id: true, title: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return {
    success: true,
    data: tasks.map(({ project, _count, ...task }) => ({
      ...task,
      commentCount: _count.comments,
      attachmentCount: _count.attachments,
      assigneeName: auth.data.name,
      projectId: project.id,
      projectTitle: project.title,
    })),
  };
}

// Drag and drop: changes the column and/or the place inside it. beforeTaskId
// is the card the task is dropped in front of; null means the end of the
// column and undefined leaves the position alone (status change only).
export async function moveTask(input: {
  taskId: string;
  status: TaskStatus;
  beforeTaskId?: string | null;
}): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!input.taskId || !Object.values(TaskStatus).includes(input.status)) {
    return { success: false, error: "Dados invalidos" };
  }

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    select: {
      assigneeId: true,
      projectId: true,
      status: true,
      title: true,
      position: true,
    },
  });
  if (!task) return { success: false, error: "Tarefa nao encontrada" };

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    task.projectId,
  );
  if (!canAccess) return { success: false, error: "Sem permissao" };

  if (!isManagerRole(auth.data.role) && task.assigneeId !== auth.data.id) {
    return { success: false, error: "Sem permissao" };
  }

  // The cards already in the target column, in the order they are shown.
  const siblings = await prisma.task.findMany({
    where: {
      projectId: task.projectId,
      status: input.status,
      id: { not: input.taskId },
    },
    select: { id: true, position: true },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
  });

  let position = task.position;
  let renumber = false;
  let index = siblings.length;

  if (input.beforeTaskId !== undefined) {
    index = input.beforeTaskId
      ? siblings.findIndex((sibling) => sibling.id === input.beforeTaskId)
      : siblings.length;
    if (index === -1) return { success: false, error: "Posicao invalida" };

    const previous = siblings[index - 1];
    const next = siblings[index];

    if (!previous && !next) position = -(Date.now() / 1000);
    else if (!previous) position = next.position - 1;
    else if (!next) position = previous.position + 1;
    else {
      position = (previous.position + next.position) / 2;
      // repeated halving eventually runs out of precision
      renumber = next.position - previous.position < 1e-6;
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: input.taskId },
      data: { status: input.status, position },
    });

    if (renumber) {
      const base = siblings[0].position;
      const order = [
        ...siblings.slice(0, index).map((s) => s.id),
        input.taskId,
        ...siblings.slice(index).map((s) => s.id),
      ];
      for (const [i, id] of order.entries()) {
        await tx.task.update({ where: { id }, data: { position: base + i } });
      }
    }

    if (input.status !== task.status) {
      await tx.projectLog.create({
        data: {
          projectId: task.projectId,
          message: `Tarefa "${task.title}" atualizada. Status: ${getTaskStatusLabel(task.status)} -> ${getTaskStatusLabel(input.status)}.`,
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
