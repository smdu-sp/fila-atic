"use server";

import { isCoordination } from "@/lib/roles";
import { TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { taskStatusLabels } from "@/lib/projectLabels";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function listTaskStatusLabels(): Promise<
  ActionResult<Record<TaskStatus, string>>
> {
  if (!(await getCurrentUser())) {
    return { success: false, error: "Nao autenticado" };
  }

  const custom = await prisma.taskStatusLabel.findMany({
    select: { status: true, label: true },
  });

  const labels: Record<TaskStatus, string> = { ...taskStatusLabels };
  custom.forEach((entry) => {
    labels[entry.status] = entry.label;
  });

  return { success: true, data: labels };
}

export async function updateTaskStatusLabels(
  input: Record<TaskStatus, string>,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  if (!isCoordination(user.role)) {
    return { success: false, error: "Sem permissao" };
  }

  const entries = Object.values(TaskStatus).map((status) => ({
    status,
    label: (input[status] ?? "").trim(),
  }));

  if (entries.some((entry) => !entry.label)) {
    return { success: false, error: "Todos os status precisam de nome" };
  }

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.taskStatusLabel.upsert({
        where: { status: entry.status },
        update: { label: entry.label },
        create: { status: entry.status, label: entry.label },
      }),
    ),
  );

  revalidatePath("/kanban");

  return { success: true, data: undefined };
}
