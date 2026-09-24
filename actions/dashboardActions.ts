"use server";

import { ASSIGNABLE_ROLES, isCoordination, isStaffRole } from "@/lib/roles";
import { ProjectStatus, Role, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { todayInAppZone } from "@/lib/dueDate";
import { getPriorityLabel } from "@/lib/projectLabels";
import { buildTimeline, type Timeline } from "@/lib/reports";
import { CLOSED_TASK_STATUSES } from "@/lib/taskStatus";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type ChartItem = {
  label: string;
  value: number;
};

type DashboardCharts = {
  projectsByDeveloper: ChartItem[];
  openRequestsByUser: ChartItem[];
  projectsByPriority: ChartItem[];
};

async function getUserRole(): Promise<ActionResult<Role>> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  return { success: true, data: user.role };
}

function buildLabelMap(
  users: Array<{ id: string; name: string }>,
  fallback = "Desconhecido",
) {
  const map = new Map<string, string>();
  users.forEach((user) => map.set(user.id, user.name));
  return (id: string) => map.get(id) ?? fallback;
}

export async function listDashboardCharts(): Promise<
  ActionResult<DashboardCharts>
> {
  const roleResult = await getUserRole();
  if (!roleResult.success) return roleResult;

  if (!isCoordination(roleResult.data)) {
    return { success: false, error: "Sem permissao" };
  }

  const [devGroups, requesterGroups, priorityGroups] = await Promise.all([
    prisma.projectDeveloper.groupBy({
      by: ["userId"],
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 6,
    }),
    prisma.project.groupBy({
      by: ["requesterId"],
      where: {
        NOT: [
          { status: ProjectStatus.FINISHED },
          { status: ProjectStatus.CANCELED },
        ],
      },
      _count: { requesterId: true },
      orderBy: { _count: { requesterId: "desc" } },
      take: 6,
    }),
    prisma.project.groupBy({
      by: ["priority"],
      _count: { priority: true },
      orderBy: { _count: { priority: "desc" } },
    }),
  ]);

  const userIds = Array.from(
    new Set([
      ...devGroups.map((row) => row.userId),
      ...requesterGroups.map((row) => row.requesterId),
    ]),
  );

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });

  const labelFor = buildLabelMap(users);

  const projectsByDeveloper = devGroups.map((row) => ({
    label: labelFor(row.userId),
    value: row._count.userId,
  }));

  const openRequestsByUser = requesterGroups.map((row) => ({
    label: labelFor(row.requesterId),
    value: row._count.requesterId,
  }));

  const projectsByPriority = priorityGroups.map((row) => ({
    label: getPriorityLabel(row.priority),
    value: row._count.priority,
  }));

  return {
    success: true,
    data: {
      projectsByDeveloper,
      openRequestsByUser,
      projectsByPriority,
    },
  };
}

export type DashboardMetrics = {
  // "all": every task (coordination). "mine": only the ones assigned to the
  // person looking (developers).
  scope: "all" | "mine";
  tasksByStatus: Record<TaskStatus, number>;
  // Requests opened/finished per week over the last 12 weeks (coordination).
  timeline: Timeline | null;
  // Open and late tasks per developer (coordination).
  workload: Array<{ id: string; name: string; open: number; overdue: number }> | null;
};

const WEEKS = 12;
const DAY_MS = 86_400_000;

export async function getDashboardMetrics(): Promise<
  ActionResult<DashboardMetrics>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!isStaffRole(user.role)) return { success: false, error: "Sem permissao" };

  const coordination = isCoordination(user.role);
  const taskGroups = await prisma.task.groupBy({
    by: ["status"],
    where: coordination ? {} : { assigneeId: user.id },
    _count: { _all: true },
  });
  const tasksByStatus = Object.fromEntries(
    Object.values(TaskStatus).map((status) => [status, 0]),
  ) as Record<TaskStatus, number>;
  taskGroups.forEach((row) => {
    tasksByStatus[row.status] = row._count._all;
  });

  if (!coordination) {
    return {
      success: true,
      data: { scope: "mine", tasksByStatus, timeline: null, workload: null },
    };
  }

  const today = todayInAppZone();
  const from = new Date(today.getTime() - WEEKS * 7 * DAY_MS);

  const [created, finished, developers, openByDev, overdueByDev] =
    await Promise.all([
      prisma.project.findMany({
        where: { createdAt: { gte: from } },
        select: { createdAt: true },
      }),
      prisma.projectStatusChange.findMany({
        where: { toStatus: ProjectStatus.FINISHED, createdAt: { gte: from } },
        select: { createdAt: true },
      }),
      prisma.user.findMany({
        where: {
          isActive: true,
          role: { in: ASSIGNABLE_ROLES },
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: {
          assigneeId: { not: null },
          status: { notIn: CLOSED_TASK_STATUSES },
        },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: {
          assigneeId: { not: null },
          status: { notIn: CLOSED_TASK_STATUSES },
          dueDate: { lt: today },
        },
        _count: { _all: true },
      }),
    ]);

  const countOf = (
    rows: Array<{ assigneeId: string | null; _count: { _all: number } }>,
    id: string,
  ) => rows.find((row) => row.assigneeId === id)?._count._all ?? 0;

  return {
    success: true,
    data: {
      scope: "all",
      tasksByStatus,
      timeline: buildTimeline({
        created: created.map((row) => row.createdAt),
        finished: finished.map((row) => row.createdAt),
        from,
      }),
      workload: developers.map((dev) => ({
        id: dev.id,
        name: dev.name,
        open: countOf(openByDev, dev.id),
        overdue: countOf(overdueByDev, dev.id),
      })),
    },
  };
}
