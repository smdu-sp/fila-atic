"use server";

import { isCoordination, isManagerRole } from "@/lib/roles";
import {
  ProjectPriority,
  ProjectStatus,
  Role,
  type Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notifyGuestRequester } from "@/lib/guestMail";
import { getPriorityLabel, getStatusLabel } from "@/lib/projectLabels";
import { createProjectLog } from "@/lib/projectLogs";
import {
  notifyNewRequest,
  notifyProjectAssigned,
  notifyRequesterOf,
} from "@/lib/notifications";
import {
  closeTasks,
  planTaskDecision,
  recordStatusChange,
  touchProject,
  type OpenTask,
  type StatusChangeOptions,
} from "@/lib/projectStatus";
import { CLOSED_TASK_STATUSES, DONE_TASK_STATUSES } from "@/lib/taskStatus";
import {
  formatDueDate,
  parseDateInput,
  toDateInput,
  todayInAppZone,
} from "@/lib/dueDate";
import { PAGE_SIZE, pageCount, type Page } from "@/lib/listParams";
import { hasCustomValue } from "@/lib/requestForm";
import { deleteUploads } from "@/lib/uploads";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; openTasks?: OpenTask[] };

type CreateProjectInput = {
  title: string;
  description: string;
  justification: string;
  priority?: ProjectPriority;
  customFields?: Record<string, string | undefined>;
};

type UpdateProjectInput = {
  id: string;
  title?: string;
  description?: string;
  justification?: string;
  priority?: ProjectPriority;
  status?: ProjectStatus;
  // "YYYY-MM-DD" sets the delivery forecast, null clears it, undefined leaves it.
  dueDate?: string | null;
} & StatusChangeOptions;

type AssignDeveloperInput = {
  projectId: string;
  userId: string;
};

type RemoveDeveloperInput = AssignDeveloperInput & {
  // Take the developer's open tasks in this project away from them.
  unassignTasks?: boolean;
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

function canManageProject(role: Role) {
  return isCoordination(role) || role === Role.DEV_GLOBAL;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ActionResult<string>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (
    auth.data.role !== Role.REQUESTER &&
    !isCoordination(auth.data.role)
  ) {
    return { success: false, error: "Sem permissao" };
  }

  const title = normalize(input.title || "");
  const description = normalize(input.description || "");
  const justification = normalize(input.justification || "");

  if (!title || !description || !justification) {
    return { success: false, error: "Campos obrigatorios ausentes" };
  }

  const customFields = input.customFields ?? {};
  const customConfigs = await prisma.projectRequestField.findMany({
    where: { isSystem: false, isActive: true },
    select: { id: true, label: true, required: true, fieldType: true },
  });

  for (const field of customConfigs) {
    const value = customFields[field.id];
    if (field.required && !hasCustomValue(field.fieldType, value)) {
      return {
        success: false,
        error: `Campo obrigatorio: ${field.label}`,
      };
    }
  }

  const project = await prisma.$transaction(async (tx) => {
    const created = await tx.project.create({
      data: {
        title,
        description,
        justification,
        priority: input.priority ?? ProjectPriority.MEDIUM,
        requesterId: auth.data.id,
      },
    });

    const values = customConfigs
      .map((field) => ({
        fieldId: field.id,
        fieldType: field.fieldType,
        value: customFields[field.id]?.trim() ?? "",
      }))
      .filter((entry) => hasCustomValue(entry.fieldType, entry.value));

    if (values.length) {
      await tx.projectRequestFieldValue.createMany({
        data: values.map((entry) => ({
          projectId: created.id,
          fieldId: entry.fieldId,
          value: entry.value,
        })),
      });
    }

    await recordStatusChange(tx, {
      projectId: created.id,
      from: null,
      to: created.status,
      byName: auth.data.name,
    });

    await tx.projectLog.create({
      data: {
        projectId: created.id,
        message: `Projeto "${title}" criado.`,
        authorName: auth.data.name,
        isInternal: true,
      },
    });

    return created;
  });

  revalidatePath("/fila");
  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  const requester = await prisma.user.findUnique({
    where: { id: auth.data.id },
    select: { department: true },
  });
  await notifyNewRequest({
    projectId: project.id,
    title,
    requesterName: auth.data.name,
    department: requester?.department ?? "",
    exceptUserId: auth.data.id,
  });

  return { success: true, data: project.id };
}

export async function updateProject(
  input: UpdateProjectInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!canManageProject(auth.data.role)) {
    return { success: false, error: "Sem permissao" };
  }

  if (!input.id) {
    return { success: false, error: "Projeto invalido" };
  }

  if (input.status && !Object.values(ProjectStatus).includes(input.status)) {
    return { success: false, error: "Status invalido" };
  }

  const due = parseDateInput(input.dueDate);
  if (!due.ok) {
    return { success: false, error: "Data de previsao invalida" };
  }

  const current = await prisma.project.findUnique({
    where: { id: input.id },
    select: { title: true, status: true, priority: true, dueDate: true },
  });

  if (!current) {
    return { success: false, error: "Projeto nao encontrado" };
  }

  const updates: string[] = [];
  if (input.status && input.status !== current.status) {
    updates.push(
      `Status: ${getStatusLabel(current.status)} -> ${getStatusLabel(input.status)}`,
    );
  }
  if (input.priority && input.priority !== current.priority) {
    updates.push(
      `Prioridade: ${getPriorityLabel(current.priority)} -> ${getPriorityLabel(input.priority)}`,
    );
  }

  if (
    due.value !== undefined &&
    toDateInput(due.value) !== toDateInput(current.dueDate)
  ) {
    const label = (date: Date | null) =>
      date ? formatDueDate(date) : "sem previsao";
    updates.push(`Previsao: ${label(current.dueDate)} -> ${label(due.value)}`);
  }

  const newStatus =
    input.status && input.status !== current.status ? input.status : null;

  const decision = newStatus
    ? await planTaskDecision(prisma, input.id, newStatus, input)
    : { ok: true as const, taskIdsToClose: [] };
  if (!decision.ok) return decision.failure;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: input.id },
      data: {
        title: input.title ? normalize(input.title) : undefined,
        description: input.description
          ? normalize(input.description)
          : undefined,
        justification: input.justification
          ? normalize(input.justification)
          : undefined,
        priority: input.priority,
        status: input.status,
        dueDate: due.value,
      },
    });

    await tx.projectLog.create({
      data: {
        projectId: input.id,
        message: updates.length
          ? `Projeto "${current.title}" atualizado. ${updates.join(" | ")}.`
          : `Projeto "${current.title}" atualizado.`,
        authorName: auth.data.name,
        isInternal: true,
      },
    });

    if (newStatus) {
      await recordStatusChange(tx, {
        projectId: input.id,
        from: current.status,
        to: newStatus,
        byName: auth.data.name,
      });
    }
    await closeTasks(tx, input.id, decision.taskIdsToClose, auth.data.name);
  });

  if (input.status && input.status !== current.status) {
    await notifyGuestRequester(
      input.id,
      `O status da sua solicitacao foi atualizado para "${getStatusLabel(input.status)}".`,
    );
  }

  if (newStatus) {
    await notifyRequesterOf({
      projectId: input.id,
      kind: "STATUS_CHANGED",
      title: `Status de "{projeto}": ${getStatusLabel(newStatus)}`,
      exceptUserId: auth.data.id,
    });
  }
  if (
    due.value !== undefined &&
    toDateInput(due.value) !== toDateInput(current.dueDate)
  ) {
    await notifyRequesterOf({
      projectId: input.id,
      kind: "DUE_CHANGED",
      title: due.value
        ? `Previsão de entrega de "{projeto}": ${formatDueDate(due.value)}`
        : 'Previsão de entrega de "{projeto}" removida',
      exceptUserId: auth.data.id,
    });
  }

  revalidatePath("/fila");
  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}

export async function deleteProject(
  projectId: string,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!isCoordination(auth.data.role)) {
    return { success: false, error: "Sem permissao" };
  }

  if (!projectId) {
    return { success: false, error: "Projeto invalido" };
  }

  const current = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      title: true,
      logs: { select: { attachments: { select: { fileUrl: true } } } },
    },
  });

  if (!current) {
    return { success: false, error: "Projeto nao encontrado" };
  }

  // Logs cascade with the project, so a "removed" log cannot be kept (its
  // projectId would violate the FK and roll the delete back).
  await prisma.project.delete({ where: { id: projectId } });

  await deleteUploads(
    current.logs.flatMap((log) =>
      log.attachments.map((attachment) => attachment.fileUrl),
    ),
  );

  revalidatePath("/fila");
  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}

export type ProjectListItem = {
  id: string;
  title: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  requesterId: string;
  requesterName: string;
  requesterDepartment: string;
  createdAt: Date;
  updatedAt: Date;
  dueDate: Date | null;
  // Cancelled tasks are left out of both numbers.
  taskTotal: number;
  taskDone: number;
  developerIds: string[];
};

const projectListSelect = {
  id: true,
  title: true,
  status: true,
  priority: true,
  requesterId: true,
  requester: { select: { name: true, department: true } },
  createdAt: true,
  updatedAt: true,
  dueDate: true,
  developers: { select: { userId: true } },
} satisfies Prisma.ProjectSelect;

type ProjectListRow = Prisma.ProjectGetPayload<{
  select: typeof projectListSelect;
}>;

// What each role may see: requesters their own, restricted developers the
// projects they belong to, everyone else all of them.
function visibleTo(auth: { id: string; role: Role }): Prisma.ProjectWhereInput {
  if (auth.role === Role.REQUESTER) return { requesterId: auth.id };
  if (auth.role === Role.DEV_RESTRICTED) {
    return { developers: { some: { userId: auth.id } } };
  }
  return {};
}

async function toListItems(
  rows: ProjectListRow[],
  role: Role,
): Promise<ProjectListItem[]> {
  const counts = await prisma.task.groupBy({
    by: ["projectId", "status"],
    where: { projectId: { in: rows.map((row) => row.id) } },
    _count: { _all: true },
  });

  const progress = new Map<string, { total: number; done: number }>();
  for (const row of counts) {
    if (row.status === "CANCELED") continue;
    const entry = progress.get(row.projectId) ?? { total: 0, done: 0 };
    entry.total += row._count._all;
    if (DONE_TASK_STATUSES.includes(row.status)) entry.done += row._count._all;
    progress.set(row.projectId, entry);
  }

  return rows.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    priority: item.priority,
    requesterId: item.requesterId,
    requesterName: item.requester.name,
    requesterDepartment: item.requester.department,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    dueDate: item.dueDate,
    taskTotal: progress.get(item.id)?.total ?? 0,
    taskDone: progress.get(item.id)?.done ?? 0,
    // requesters do not need to know who is on the team
    developerIds:
      role === Role.REQUESTER ? [] : item.developers.map((dev) => dev.userId),
  }));
}

// Everything the user can see, newest first. The Kanban and the dashboard
// need the whole set; list pages use searchProjects.
export async function listProjects(): Promise<
  ActionResult<ProjectListItem[]>
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  const rows = await prisma.project.findMany({
    where: visibleTo(auth.data),
    select: projectListSelect,
    orderBy: { createdAt: "desc" },
  });

  return { success: true, data: await toListItems(rows, auth.data.role) };
}

export type ProjectSearch = {
  q?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  developerId?: string;
  overdue?: boolean;
  sort?: "recent" | "due" | "updated";
  page?: number;
};

export async function searchProjects(
  params: ProjectSearch = {},
): Promise<ActionResult<Page<ProjectListItem>>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  const filters: Prisma.ProjectWhereInput[] = [visibleTo(auth.data)];

  const q = params.q?.trim().slice(0, 100);
  if (q) {
    filters.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { requester: { name: { contains: q, mode: "insensitive" } } },
        { requester: { department: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  if (params.status && Object.values(ProjectStatus).includes(params.status)) {
    filters.push({ status: params.status });
  }
  if (
    params.priority &&
    Object.values(ProjectPriority).includes(params.priority)
  ) {
    filters.push({ priority: params.priority });
  }
  if (params.developerId) {
    filters.push({ developers: { some: { userId: params.developerId } } });
  }
  if (params.overdue) {
    filters.push({
      dueDate: { lt: todayInAppZone() },
      status: { notIn: [ProjectStatus.FINISHED, ProjectStatus.CANCELED] },
    });
  }

  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    params.sort === "due"
      ? [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }]
      : params.sort === "updated"
        ? [{ updatedAt: "desc" }]
        : [{ createdAt: "desc" }];

  const where: Prisma.ProjectWhereInput = { AND: filters };
  const total = await prisma.project.count({ where });
  const pages = pageCount(total);
  const page = Math.min(Math.max(1, Math.trunc(params.page ?? 1)), pages);

  const rows = await prisma.project.findMany({
    where,
    select: projectListSelect,
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    success: true,
    data: {
      items: await toListItems(rows, auth.data.role),
      total,
      page,
      pageSize: PAGE_SIZE,
      pageCount: pages,
    },
  };
}

export async function assignDeveloper(
  input: AssignDeveloperInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (
    !isManagerRole(auth.data.role)
  ) {
    return { success: false, error: "Sem permissao" };
  }

  if (!input.projectId || !input.userId) {
    return { success: false, error: "Dados invalidos" };
  }

  const [project, developer] = await Promise.all([
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, title: true },
    }),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true, role: true, isActive: true },
    }),
  ]);

  if (!project) {
    return { success: false, error: "Projeto nao encontrado" };
  }

  if (
    !developer ||
    !developer.isActive ||
    (developer.role !== Role.DEV_GLOBAL &&
      developer.role !== Role.DEV_RESTRICTED)
  ) {
    return { success: false, error: "Desenvolvedor invalido" };
  }

  await prisma.projectDeveloper.upsert({
    where: {
      projectId_userId: {
        projectId: input.projectId,
        userId: input.userId,
      },
    },
    update: {},
    create: {
      projectId: input.projectId,
      userId: input.userId,
    },
  });

  await createProjectLog({
    projectId: input.projectId,
    message: `Desenvolvedor ${developer.name} atribuido ao projeto.`,
    authorName: auth.data.name,
    isInternal: true,
  });

  await notifyProjectAssigned({
    projectId: input.projectId,
    title: project.title,
    userId: input.userId,
    exceptUserId: auth.data.id,
  });

  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}

export async function removeDeveloper(
  input: RemoveDeveloperInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (
    !isManagerRole(auth.data.role)
  ) {
    return { success: false, error: "Sem permissao" };
  }

  if (!input.projectId || !input.userId) {
    return { success: false, error: "Dados invalidos" };
  }

  const member = await prisma.projectDeveloper.findUnique({
    where: {
      projectId_userId: { projectId: input.projectId, userId: input.userId },
    },
    select: { user: { select: { name: true } } },
  });

  if (!member) {
    return { success: false, error: "Desenvolvedor nao esta atribuido" };
  }

  const openTasks = await prisma.task.findMany({
    where: {
      projectId: input.projectId,
      assigneeId: input.userId,
      status: { notIn: CLOSED_TASK_STATUSES },
    },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  if (openTasks.length && !input.unassignTasks) {
    return {
      success: false,
      error:
        openTasks.length === 1
          ? `${member.user.name} tem 1 tarefa em aberto neste projeto`
          : `${member.user.name} tem ${openTasks.length} tarefas em aberto neste projeto`,
      openTasks,
    };
  }

  await prisma.$transaction(async (tx) => {
    if (openTasks.length) {
      await tx.task.updateMany({
        where: { id: { in: openTasks.map((task) => task.id) } },
        data: { assigneeId: null },
      });
    }

    await tx.projectDeveloper.delete({
      where: {
        projectId_userId: { projectId: input.projectId, userId: input.userId },
      },
    });

    await tx.projectLog.create({
      data: {
        projectId: input.projectId,
        message: openTasks.length
          ? `Desenvolvedor ${member.user.name} removido do projeto. ${openTasks.length} tarefa(s) em aberto ficaram sem responsavel.`
          : `Desenvolvedor ${member.user.name} removido do projeto.`,
        authorName: auth.data.name,
        isInternal: true,
      },
    });

    await touchProject(tx, input.projectId);
  });

  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}
