"use server";

import {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
  Role,
  TaskStatus,
} from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { todayInAppZone } from "@/lib/dueDate";
import { dayRange } from "@/lib/listParams";
import { prisma } from "@/lib/prisma";
import { averageDaysInStatus, buildTimeline, type Timeline } from "@/lib/reports";
import { isCoordination } from "@/lib/roles";
import { CLOSED_TASK_STATUSES, DONE_TASK_STATUSES } from "@/lib/taskStatus";

// Reports for coordination: how requests and tasks moved in a period. Every
// number here is either "opened/changed/finished during the period" (period
// filter applies) or a live snapshot ("open right now"), and each figure
// below says which one it is.

type ActionResult<T> =
  { success: true; data: T } | { success: false; error: string };

export type DeveloperReport = {
  id: string;
  name: string;
  completedInPeriod: number;
  openNow: number;
  overdueNow: number;
};

export type GeneralReport = {
  period: { from: string | null; to: string | null };
  totalProjects: number;
  byStatus: Record<ProjectStatus, number>;
  byPriority: Record<ProjectPriority, number>;
  byCategory: Record<ProjectCategory | "NONE", number>;
  // Average days spent in a status, from completed spans that started in the
  // period; a status a project has not yet left is not counted.
  avgDaysInStatus: Partial<Record<ProjectStatus, number>>;
  // Requests opened and finished per week (or month) inside the period.
  timeline: Timeline;
  // Every task by its status right now (period does not apply).
  tasksByStatus: Record<TaskStatus, number>;
  tasksCompletedInPeriod: number;
  tasksOpenNow: number;
  tasksOverdueNow: number;
  developers: DeveloperReport[];
};

const zeroed = <T extends string>(keys: readonly T[]) =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;

const countOf = (
  rows: Array<{ assigneeId: string | null; _count: { _all: number } }>,
  id: string,
) => rows.find((row) => row.assigneeId === id)?._count._all ?? 0;

export async function getGeneralReport(input: {
  from?: string;
  to?: string;
}): Promise<ActionResult<GeneralReport>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!isCoordination(user.role)) {
    return { success: false, error: "Sem permissao" };
  }

  const range = dayRange(input.from, input.to);
  const createdWhere =
    range.gte || range.lt
      ? { createdAt: { gte: range.gte, lt: range.lt } }
      : {};
  const changedInPeriod =
    range.gte || range.lt
      ? { updatedAt: { gte: range.gte, lt: range.lt } }
      : {};
  const today = todayInAppZone();

  const [
    statusGroups,
    priorityGroups,
    categoryGroups,
    statusEvents,
    createdProjects,
    taskGroups,
  ] = await Promise.all([
      prisma.project.groupBy({
        by: ["status"],
        where: createdWhere,
        _count: { _all: true },
      }),
      prisma.project.groupBy({
        by: ["priority"],
        where: createdWhere,
        _count: { _all: true },
      }),
      prisma.project.groupBy({
        by: ["category"],
        where: createdWhere,
        _count: { _all: true },
      }),
      prisma.projectStatusChange.findMany({
        select: { projectId: true, toStatus: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.project.findMany({
        where: createdWhere,
        select: { createdAt: true },
      }),
      prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

  const totalProjects = statusGroups.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );

  const byStatus = zeroed(Object.values(ProjectStatus));
  statusGroups.forEach((row) => {
    byStatus[row.status] = row._count._all;
  });

  const byPriority = zeroed(Object.values(ProjectPriority));
  priorityGroups.forEach((row) => {
    byPriority[row.priority] = row._count._all;
  });

  const byCategory = {
    ...zeroed(Object.values(ProjectCategory)),
    NONE: 0,
  } as Record<ProjectCategory | "NONE", number>;
  categoryGroups.forEach((row) => {
    byCategory[row.category ?? "NONE"] = row._count._all;
  });

  const tasksByStatus = zeroed(Object.values(TaskStatus));
  taskGroups.forEach((row) => {
    tasksByStatus[row.status] = row._count._all;
  });

  const timeline = buildTimeline({
    created: createdProjects.map((project) => project.createdAt),
    finished: statusEvents
      .filter(
        (event) =>
          event.toStatus === ProjectStatus.FINISHED &&
          (!range.gte || event.createdAt >= range.gte) &&
          (!range.lt || event.createdAt < range.lt),
      )
      .map((event) => event.createdAt),
    from: range.gte,
    to: range.lt,
  });

  const avgDaysInStatus = averageDaysInStatus(statusEvents, {
    from: range.gte,
    to: range.lt,
  });

  const [
    tasksCompletedInPeriod,
    tasksOpenNow,
    tasksOverdueNow,
    developers,
    completedByDev,
    openByDev,
    overdueByDev,
  ] = await Promise.all([
    prisma.task.count({
      where: { status: { in: DONE_TASK_STATUSES }, ...changedInPeriod },
    }),
    prisma.task.count({
      where: { status: { notIn: CLOSED_TASK_STATUSES } },
    }),
    prisma.task.count({
      where: {
        status: { notIn: CLOSED_TASK_STATUSES },
        dueDate: { lt: today },
      },
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [Role.DEV_GLOBAL, Role.DEV_RESTRICTED] },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: {
        assigneeId: { not: null },
        status: { in: DONE_TASK_STATUSES },
        ...changedInPeriod,
      },
      _count: { _all: true },
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

  return {
    success: true,
    data: {
      period: { from: input.from ?? null, to: input.to ?? null },
      totalProjects,
      byStatus,
      byPriority,
      byCategory,
      avgDaysInStatus,
      timeline,
      tasksByStatus,
      tasksCompletedInPeriod,
      tasksOpenNow,
      tasksOverdueNow,
      developers: developers.map((dev) => ({
        id: dev.id,
        name: dev.name,
        completedInPeriod: countOf(completedByDev, dev.id),
        openNow: countOf(openByDev, dev.id),
        overdueNow: countOf(overdueByDev, dev.id),
      })),
    },
  };
}
