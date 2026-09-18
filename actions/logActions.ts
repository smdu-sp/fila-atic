"use server";

import { Role, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { dayRange, PAGE_SIZE, pageCount, type Page } from "@/lib/listParams";

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

export async function listProjectLogs(): Promise<
  ActionResult<
    Array<{
      id: string;
      message: string;
      authorName: string;
      createdAt: Date;
      isInternal: boolean;
      projectTitle: string;
    }>
  >
> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  if (auth.data.role === Role.REQUESTER) {
    const logs = await prisma.projectLog.findMany({
      where: {
        isInternal: false,
        project: { requesterId: auth.data.id },
      },
      select: {
        id: true,
        message: true,
        authorName: true,
        createdAt: true,
        isInternal: true,
        project: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return {
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        message: log.message,
        authorName: log.authorName,
        createdAt: log.createdAt,
        isInternal: log.isInternal,
        projectTitle: log.project.title,
      })),
    };
  }

  if (auth.data.role === Role.DEV_RESTRICTED) {
    const logs = await prisma.projectLog.findMany({
      where: {
        project: { developers: { some: { userId: auth.data.id } } },
      },
      select: {
        id: true,
        message: true,
        authorName: true,
        createdAt: true,
        isInternal: true,
        project: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return {
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        message: log.message,
        authorName: log.authorName,
        createdAt: log.createdAt,
        isInternal: log.isInternal,
        projectTitle: log.project.title,
      })),
    };
  }

  const logs = await prisma.projectLog.findMany({
    select: {
      id: true,
      message: true,
      authorName: true,
      createdAt: true,
      isInternal: true,
      project: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return {
    success: true,
    data: logs.map((log) => ({
      id: log.id,
      message: log.message,
      authorName: log.authorName,
      createdAt: log.createdAt,
      isInternal: log.isInternal,
      projectTitle: log.project.title,
    })),
  };
}

export type LogItem = {
  id: string;
  message: string;
  authorName: string;
  createdAt: Date;
  isInternal: boolean;
  projectTitle: string;
};

export type LogSearch = {
  q?: string;
  // "YYYY-MM-DD", inclusive
  from?: string;
  to?: string;
  visibility?: "internal" | "public";
  page?: number;
};

export async function searchProjectLogs(
  params: LogSearch = {},
): Promise<ActionResult<Page<LogItem>>> {
  const auth = await getUserOrError();
  if (!auth.success) return auth;

  // Same visibility as listProjectLogs.
  const filters: Prisma.ProjectLogWhereInput[] = [];
  if (auth.data.role === Role.REQUESTER) {
    filters.push({
      isInternal: false,
      project: { requesterId: auth.data.id },
    });
  } else if (auth.data.role === Role.DEV_RESTRICTED) {
    filters.push({
      project: { developers: { some: { userId: auth.data.id } } },
    });
  }

  const q = params.q?.trim().slice(0, 100);
  if (q) {
    filters.push({
      OR: [
        { message: { contains: q, mode: "insensitive" } },
        { authorName: { contains: q, mode: "insensitive" } },
        { project: { title: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  const range = dayRange(params.from, params.to);
  if (range.gte || range.lt) {
    filters.push({ createdAt: { gte: range.gte, lt: range.lt } });
  }

  if (params.visibility === "internal") filters.push({ isInternal: true });
  if (params.visibility === "public") filters.push({ isInternal: false });

  const where: Prisma.ProjectLogWhereInput = { AND: filters };
  const total = await prisma.projectLog.count({ where });
  const pages = pageCount(total);
  const page = Math.min(Math.max(1, Math.trunc(params.page ?? 1)), pages);

  const rows = await prisma.projectLog.findMany({
    where,
    select: {
      id: true,
      message: true,
      authorName: true,
      createdAt: true,
      isInternal: true,
      project: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    success: true,
    data: {
      items: rows.map((row) => ({
        id: row.id,
        message: row.message,
        authorName: row.authorName,
        createdAt: row.createdAt,
        isInternal: row.isInternal,
        projectTitle: row.project.title,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      pageCount: pages,
    },
  };
}
