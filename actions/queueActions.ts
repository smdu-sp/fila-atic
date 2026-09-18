"use server";

import { ProjectPriority, ProjectStatus, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

async function getUserOrError(): Promise<
  ActionResult<{ id: string; role: Role }>
> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  return {
    success: true,
    data: { id: user.id, role: user.role },
  };
}

export async function listQueueProjects(): Promise<
  ActionResult<
    Array<{
      id: string;
      title: string;
      priority: ProjectPriority;
      createdAt: Date;
      requesterId: string;
      requesterName: string;
      requesterDepartment: string;
      status: ProjectStatus;
    }>
  >
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (auth.data.role !== Role.COORDINATOR) {
    return { success: false, error: "Sem permissao" };
  }

  const projects = await prisma.project.findMany({
    where: { status: ProjectStatus.IN_QUEUE },
    select: {
      id: true,
      title: true,
      priority: true,
      createdAt: true,
      requesterId: true,
      requester: { select: { name: true, department: true } },
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    success: true,
    data: projects.map((project) => ({
      id: project.id,
      title: project.title,
      priority: project.priority,
      createdAt: project.createdAt,
      requesterId: project.requesterId,
      requesterName: project.requester.name,
      requesterDepartment: project.requester.department,
      status: project.status,
    })),
  };
}
