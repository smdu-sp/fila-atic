"use server";

import {
  ProjectPriority,
  ProjectStatus,
  Role,
  type Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PAGE_SIZE, pageCount, type Page } from "@/lib/listParams";

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

export type QueueItem = {
  id: string;
  title: string;
  priority: ProjectPriority;
  createdAt: Date;
  requesterName: string;
  requesterDepartment: string;
  status: ProjectStatus;
  dueDate: Date | null;
};

export type QueueSearch = {
  q?: string;
  priority?: ProjectPriority;
  // oldest first is the default: the longest wait is the most urgent to look at
  sort?: "oldest" | "newest" | "priority";
  page?: number;
};

export async function searchQueue(
  params: QueueSearch = {},
): Promise<ActionResult<Page<QueueItem>>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (auth.data.role !== Role.COORDINATOR) {
    return { success: false, error: "Sem permissao" };
  }

  const filters: Prisma.ProjectWhereInput[] = [
    { status: ProjectStatus.IN_QUEUE },
  ];

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
  if (
    params.priority &&
    Object.values(ProjectPriority).includes(params.priority)
  ) {
    filters.push({ priority: params.priority });
  }

  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    params.sort === "newest"
      ? [{ createdAt: "desc" }]
      : params.sort === "priority"
        ? // enum order is LOW < MEDIUM < HIGH < URGENT
          [{ priority: "desc" }, { createdAt: "asc" }]
        : [{ createdAt: "asc" }];

  const where: Prisma.ProjectWhereInput = { AND: filters };
  const total = await prisma.project.count({ where });
  const pages = pageCount(total);
  const page = Math.min(Math.max(1, Math.trunc(params.page ?? 1)), pages);

  const rows = await prisma.project.findMany({
    where,
    select: {
      id: true,
      title: true,
      priority: true,
      createdAt: true,
      status: true,
      dueDate: true,
      requester: { select: { name: true, department: true } },
    },
    orderBy,
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    success: true,
    data: {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        priority: row.priority,
        createdAt: row.createdAt,
        status: row.status,
        dueDate: row.dueDate,
        requesterName: row.requester.name,
        requesterDepartment: row.requester.department,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      pageCount: pages,
    },
  };
}

// Numbers for the summary cards: the whole queue, whatever the filters say.
export async function queueStats(): Promise<
  ActionResult<{ total: number; high: number; urgent: number }>
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (auth.data.role !== Role.COORDINATOR) {
    return { success: false, error: "Sem permissao" };
  }

  const inQueue = { status: ProjectStatus.IN_QUEUE };
  const [total, high, urgent] = await Promise.all([
    prisma.project.count({ where: inQueue }),
    prisma.project.count({
      where: {
        ...inQueue,
        priority: { in: [ProjectPriority.HIGH, ProjectPriority.URGENT] },
      },
    }),
    prisma.project.count({
      where: { ...inQueue, priority: ProjectPriority.URGENT },
    }),
  ]);

  return { success: true, data: { total, high, urgent } };
}
