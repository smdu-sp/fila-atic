"use server";

import { ProjectPriority, ProjectStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getPriorityLabel, getStatusLabel } from "@/lib/projectLabels";
import { createProjectLog } from "@/lib/projectLogs";
import { deleteUploads } from "@/lib/uploads";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

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
};

type AssignDeveloperInput = {
  projectId: string;
  userId: string;
};

function normalize(input: string) {
  return input.trim();
}

function parseMultiValue(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function hasCustomValue(fieldType: string, value?: string) {
  if (fieldType === "MULTI_SELECT") {
    return parseMultiValue(value).length > 0;
  }

  return Boolean(value?.trim());
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
  return role === Role.COORDINATOR || role === Role.DEV_GLOBAL;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ActionResult<string>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (
    auth.data.role !== Role.REQUESTER &&
    auth.data.role !== Role.COORDINATOR
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

  const current = await prisma.project.findUnique({
    where: { id: input.id },
    select: { title: true, status: true, priority: true },
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
  });

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

  if (auth.data.role !== Role.COORDINATOR) {
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

export async function listProjects(): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      status: ProjectStatus;
      priority: ProjectPriority;
      requesterId: string;
      requesterName: string;
      requesterDepartment: string;
      createdAt: Date;
    }>
  >
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (auth.data.role === Role.REQUESTER) {
    const items = await prisma.project.findMany({
      where: { requesterId: auth.data.id },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        requesterId: true,
        requester: { select: { name: true, department: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      success: true,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        requesterId: item.requesterId,
        requesterName: item.requester.name,
        requesterDepartment: item.requester.department,
        createdAt: item.createdAt,
      })),
    };
  }

  if (auth.data.role === Role.DEV_RESTRICTED) {
    const items = await prisma.project.findMany({
      where: {
        developers: { some: { userId: auth.data.id } },
      },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        requesterId: true,
        requester: { select: { name: true, department: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      success: true,
      data: items.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        requesterId: item.requesterId,
        requesterName: item.requester.name,
        requesterDepartment: item.requester.department,
        createdAt: item.createdAt,
      })),
    };
  }

  const items = await prisma.project.findMany({
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      requesterId: true,
      requester: { select: { name: true, department: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: items.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      priority: item.priority,
      requesterId: item.requesterId,
      requesterName: item.requester.name,
      requesterDepartment: item.requester.department,
      createdAt: item.createdAt,
    })),
  };
}

export async function assignDeveloper(
  input: AssignDeveloperInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (
    auth.data.role !== Role.COORDINATOR &&
    auth.data.role !== Role.DEV_GLOBAL
  ) {
    return { success: false, error: "Sem permissao" };
  }

  if (!input.projectId || !input.userId) {
    return { success: false, error: "Dados invalidos" };
  }

  const [project, developer] = await Promise.all([
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
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

  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}

export async function removeDeveloper(
  input: AssignDeveloperInput,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (
    auth.data.role !== Role.COORDINATOR &&
    auth.data.role !== Role.DEV_GLOBAL
  ) {
    return { success: false, error: "Sem permissao" };
  }

  if (!input.projectId || !input.userId) {
    return { success: false, error: "Dados invalidos" };
  }

  const removed = await prisma.projectDeveloper.deleteMany({
    where: { projectId: input.projectId, userId: input.userId },
  });

  if (removed.count === 0) {
    return { success: false, error: "Desenvolvedor nao esta atribuido" };
  }

  const developer = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { name: true },
  });

  await createProjectLog({
    projectId: input.projectId,
    message: `Desenvolvedor ${developer?.name ?? input.userId} removido do projeto.`,
    authorName: auth.data.name,
    isInternal: true,
  });

  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  return { success: true, data: undefined };
}
