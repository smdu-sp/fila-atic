"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { PAGE_SIZE, pageCount, type Page } from "@/lib/listParams";
import { prisma } from "@/lib/prisma";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string;
  readAt: Date | null;
  createdAt: Date;
};

const select = {
  id: true,
  kind: true,
  title: true,
  body: true,
  href: true,
  readAt: true,
  createdAt: true,
} as const;

// Everything here concerns only the signed-in person's own notifications.

export async function getNotificationSummary(): Promise<
  ActionResult<{ unread: number; items: NotificationItem[] }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };

  const [unread, items] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      select,
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return { success: true, data: { unread, items } };
}

export async function searchNotifications(
  params: { unread?: boolean; page?: number } = {},
): Promise<ActionResult<Page<NotificationItem>>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };

  const where = {
    userId: user.id,
    ...(params.unread ? { readAt: null } : {}),
  };
  const total = await prisma.notification.count({ where });
  const pages = pageCount(total);
  const page = Math.min(Math.max(1, Math.trunc(params.page ?? 1)), pages);

  const items = await prisma.notification.findMany({
    where,
    select,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  return {
    success: true,
    data: { items, total, page, pageSize: PAGE_SIZE, pageCount: pages },
  };
}

export async function markNotificationRead(
  id: string,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };

  // userId in the filter: nobody can touch someone else's notifications
  await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return { success: true, data: undefined };
}

export async function markAllNotificationsRead(): Promise<
  ActionResult<{ marked: number }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };

  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notificacoes");
  return { success: true, data: { marked: result.count } };
}

export async function setEmailNotifications(
  enabled: boolean,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };

  await prisma.user.update({
    where: { id: user.id },
    data: { emailNotifications: enabled === true },
  });

  revalidatePath("/perfil");
  return { success: true, data: undefined };
}
