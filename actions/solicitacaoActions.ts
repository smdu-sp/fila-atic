"use server";

import { revalidatePath } from "next/cache";

import { ASSIGNABLE_ROLES, isManagerRole } from "@/lib/roles";
import {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
  Role,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/projectAccess";
import { notifyGuestRequester } from "@/lib/guestMail";
import {
  notifyRequesterOf,
  notifyTeamOfRequesterMessage,
} from "@/lib/notifications";
import { getStatusLabel } from "@/lib/projectLabels";
import {
  closeTasks,
  planTaskDecision,
  recordStatusChange,
  type OpenTask,
  type StatusChangeOptions,
} from "@/lib/projectStatus";
import { normalizeReason, reopenUntilIfOpen } from "@/lib/requestLifecycle";
import { saveUploads, validateUploads } from "@/lib/uploads";

type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      openTasks?: OpenTask[];
      needsReason?: boolean;
    };

type ProjectDetails = {
  id: string;
  code: number;
  title: string;
  description: string;
  justification: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  createdAt: Date;
  dueDate: Date | null;
  category: ProjectCategory | null;
  closeReason: string | null;
  // until when the requester may reopen a closed request
  reopenUntil: Date | null;
  requester: {
    name: string;
    email: string;
    department: string;
  };
  developers: Array<{ id: string; name: string; role: Role }>;
  customFields: Array<{ label: string; value: string }>;
};

type ProjectMessage = {
  id: string;
  message: string;
  authorName: string;
  createdAt: Date;
  attachments: Array<{
    id: string;
    fileName: string;
    fileUrl: string;
    fileType: string | null;
    fileSize: number;
  }>;
};

type AssignableDeveloper = {
  id: string;
  name: string;
  role: Extract<Role, "DEV_GLOBAL" | "DEV_RESTRICTED" | "TECH_LEAD">;
};

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

export async function listAssignableDevelopers(): Promise<
  ActionResult<AssignableDeveloper[]>
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (
    !isManagerRole(auth.data.role)
  ) {
    return { success: false, error: "Sem permissao" };
  }

  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ASSIGNABLE_ROLES },
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  return { success: true, data: users as AssignableDeveloper[] };
}

export async function getProjectDetails(
  projectId: string,
): Promise<ActionResult<ProjectDetails>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!projectId) {
    return { success: false, error: "Projeto invalido" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      justification: true,
      status: true,
      priority: true,
      createdAt: true,
      dueDate: true,
      category: true,
      closeReason: true,
      updatedAt: true,
      requesterId: true,
      requester: {
        select: { name: true, email: true, department: true },
      },
      developers: {
        select: { user: { select: { id: true, name: true, role: true } } },
      },
      requestValues: {
        select: {
          value: true,
          field: { select: { label: true, isSystem: true, fieldType: true } },
        },
      },
    },
  });

  if (!project) {
    return { success: false, error: "Projeto nao encontrado" };
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    projectId,
  );
  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  const developers = project.developers.map((entry) => entry.user);
  const customFields = project.requestValues
    .filter((entry) => !entry.field.isSystem && entry.value)
    .map((entry) => {
      if (entry.field.fieldType === "MULTI_SELECT") {
        try {
          const parsed = JSON.parse(entry.value);
          if (Array.isArray(parsed)) {
            return {
              label: entry.field.label,
              value: parsed.map(String).join(", "),
            };
          }
        } catch {
          return { label: entry.field.label, value: entry.value };
        }
      }

      return { label: entry.field.label, value: entry.value };
    });

  return {
    success: true,
    data: {
      id: project.id,
      code: project.code,
      title: project.title,
      description: project.description,
      justification: project.justification,
      status: project.status,
      priority: project.priority,
      createdAt: project.createdAt,
      dueDate: project.dueDate,
      category: project.category,
      closeReason: project.closeReason,
      reopenUntil: await reopenUntilIfOpen(
        project.id,
        project.status,
        project.updatedAt,
      ),
      requester: {
        name: project.requester.name,
        email: project.requester.email,
        department: project.requester.department,
      },
      developers,
      customFields,
    },
  };
}

export async function listProjectMessages(
  projectId: string,
): Promise<ActionResult<ProjectMessage[]>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (!projectId) {
    return { success: false, error: "Projeto invalido" };
  }

  const exists = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!exists) {
    return { success: false, error: "Projeto nao encontrado" };
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    projectId,
  );
  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  const logs = await prisma.projectLog.findMany({
    where: { projectId, isInternal: false },
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
    orderBy: { createdAt: "asc" },
  });

  return { success: true, data: logs };
}

export async function createProjectMessage(
  formData: FormData,
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  const projectId = String(formData.get("projectId") ?? "");
  const message = String(formData.get("message") ?? "");
  const files = formData
    .getAll("attachments")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (!projectId) {
    return { success: false, error: "Projeto invalido" };
  }

  const content = message.trim();
  const hasMessage = content.length >= 3;
  if (!hasMessage && files.length === 0) {
    return { success: false, error: "Mensagem muito curta" };
  }

  const canAccess = await canAccessProject(
    auth.data.id,
    auth.data.role,
    projectId,
  );
  if (!canAccess) {
    return { success: false, error: "Sem permissao" };
  }

  const uploadError = validateUploads(files);
  if (uploadError) {
    return { success: false, error: uploadError };
  }

  const attachments = await saveUploads(files);
  const data = {
    projectId,
    message: hasMessage ? content : "",
    authorName: auth.data.name,
    isInternal: false,
  };

  await prisma.projectLog.create({
    data:
      attachments.length > 0
        ? { ...data, attachments: { create: attachments } }
        : data,
  });

  revalidatePath(`/solicitacoes/${projectId}`);
  revalidatePath("/logs");

  await notifyGuestRequester(
    projectId,
    "Ha uma nova mensagem da equipe na sua solicitacao.",
  );

  // The requester wrote: the team hears about it. Staff wrote: the requester does.
  if (auth.data.role === Role.REQUESTER) {
    await notifyTeamOfRequesterMessage({
      projectId,
      fromName: auth.data.name,
      exceptUserId: auth.data.id,
    });
  } else {
    await notifyRequesterOf({
      projectId,
      kind: "MESSAGE",
      title: 'Nova mensagem da equipe em "{projeto}"',
      exceptUserId: auth.data.id,
    });
  }

  return { success: true, data: undefined };
}

export async function updateProjectStatusRestricted(
  projectId: string,
  status: ProjectStatus,
  options: StatusChangeOptions = {},
): Promise<ActionResult<void>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (auth.data.role !== Role.DEV_RESTRICTED) {
    return { success: false, error: "Sem permissao" };
  }

  if (!projectId || !Object.values(ProjectStatus).includes(status)) {
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

  const current = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true, title: true },
  });

  if (!current) {
    return { success: false, error: "Projeto nao encontrado" };
  }

  const changed = status !== current.status;

  let closeReason: string | null | undefined;
  if (changed && status === ProjectStatus.CANCELED) {
    closeReason = normalizeReason(options.closeReason);
    if (!closeReason) {
      return {
        success: false,
        error: "Informe o motivo do cancelamento",
        needsReason: true,
      };
    }
  } else if (changed && current.status === ProjectStatus.CANCELED) {
    closeReason = null;
  }

  const decision = changed
    ? await planTaskDecision(prisma, projectId, status, options)
    : { ok: true as const, taskIdsToClose: [] };
  if (!decision.ok) return decision.failure;

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { status, closeReason },
    });

    if (changed) {
      await recordStatusChange(tx, {
        projectId,
        from: current.status,
        to: status,
        byName: auth.data.name,
      });
    }
    await closeTasks(tx, projectId, decision.taskIdsToClose, auth.data.name);

    if (closeReason) {
      await tx.projectLog.create({
        data: {
          projectId,
          message: `Solicitação cancelada pela equipe. Motivo: ${closeReason}`,
          authorName: auth.data.name,
          isInternal: false,
        },
      });
    }

    await tx.projectLog.create({
      data: {
        projectId,
        message: `Status atualizado: ${getStatusLabel(current.status)} -> ${getStatusLabel(status)}.`,
        authorName: auth.data.name,
        isInternal: true,
      },
    });
  });

  revalidatePath(`/solicitacoes/${projectId}`);
  revalidatePath("/fila");
  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  if (status !== current.status) {
    await notifyGuestRequester(
      projectId,
      `O status da sua solicitacao foi atualizado para "${getStatusLabel(status)}".`,
    );
    await notifyRequesterOf({
      projectId,
      kind: "STATUS_CHANGED",
      title: `Status de "{projeto}": ${getStatusLabel(status)}`,
      body: closeReason ?? undefined,
      exceptUserId: auth.data.id,
    });
  }

  return { success: true, data: undefined };
}
