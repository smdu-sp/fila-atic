"use server";

import { Role } from "@prisma/client";

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
