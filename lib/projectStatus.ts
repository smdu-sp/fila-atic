import {
  ProjectStatus,
  TaskStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";

import { CLOSED_TASK_STATUSES } from "@/lib/taskStatus";

// Works with the global client and with an interactive transaction.
type Db = PrismaClient | Prisma.TransactionClient;

export type OpenTask = { id: string; title: string; status: TaskStatus };

export type StatusChangeOptions = {
  // Go ahead although the project still has open tasks.
  confirmOpenTasks?: boolean;
  // Only when cancelling: cancel the open tasks together with the project.
  closeOpenTasks?: boolean;
};

export type OpenTasksFailure = {
  success: false;
  error: string;
  openTasks: OpenTask[];
};

export async function findOpenTasks(
  db: Db,
  projectId: string,
): Promise<OpenTask[]> {
  return db.task.findMany({
    where: { projectId, status: { notIn: CLOSED_TASK_STATUSES } },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}

// Finishing or cancelling a project that still has open tasks needs an
// explicit decision from the person doing it.
export async function planTaskDecision(
  db: Db,
  projectId: string,
  to: ProjectStatus,
  options: StatusChangeOptions = {},
): Promise<
  { ok: true; taskIdsToClose: string[] } | { ok: false; failure: OpenTasksFailure }
> {
  if (to !== ProjectStatus.FINISHED && to !== ProjectStatus.CANCELED) {
    return { ok: true, taskIdsToClose: [] };
  }

  const openTasks = await findOpenTasks(db, projectId);
  if (openTasks.length === 0) return { ok: true, taskIdsToClose: [] };

  if (to === ProjectStatus.CANCELED && options.closeOpenTasks) {
    return { ok: true, taskIdsToClose: openTasks.map((task) => task.id) };
  }

  if (options.confirmOpenTasks) return { ok: true, taskIdsToClose: [] };

  const count = openTasks.length;
  return {
    ok: false,
    failure: {
      success: false,
      error:
        count === 1
          ? "O projeto ainda tem 1 tarefa em aberto"
          : `O projeto ainda tem ${count} tarefas em aberto`,
      openTasks,
    },
  };
}

export async function closeTasks(
  db: Db,
  projectId: string,
  taskIds: string[],
  byName: string,
) {
  if (taskIds.length === 0) return;

  await db.task.updateMany({
    where: { id: { in: taskIds }, projectId },
    data: { status: TaskStatus.CANCELED },
  });

  await db.projectLog.create({
    data: {
      projectId,
      message:
        taskIds.length === 1
          ? "1 tarefa em aberto foi cancelada junto com o projeto."
          : `${taskIds.length} tarefas em aberto foram canceladas junto com o projeto.`,
      authorName: byName,
      isInternal: true,
    },
  });
}

export async function recordStatusChange(
  db: Db,
  input: {
    projectId: string;
    from: ProjectStatus | null;
    to: ProjectStatus;
    byName: string;
  },
) {
  if (input.from === input.to) return;

  await db.projectStatusChange.create({
    data: {
      projectId: input.projectId,
      fromStatus: input.from,
      toStatus: input.to,
      changedByName: input.byName,
    },
  });
}

// Anything that happens to a task is activity of its project.
export async function touchProject(db: Db, projectId: string) {
  await db.project.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });
}
