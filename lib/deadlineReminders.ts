import { ProjectStatus } from "@prisma/client";

import { toDateInput, todayInAppZone } from "@/lib/dueDate";
import {
  coordinationIds,
  notifyUsers,
  projectTeamIds,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { CLOSED_TASK_STATUSES } from "@/lib/taskStatus";

const DAY_MS = 86_400_000;

type Phase = "tomorrow" | "today" | "overdue";

const phases: Array<{ offset: number; phase: Phase }> = [
  { offset: 1, phase: "tomorrow" },
  { offset: 0, phase: "today" },
  // the first day after the deadline; later days are not repeated
  { offset: -1, phase: "overdue" },
];

const taskTitle = {
  tomorrow: "Tarefa vence amanhã",
  today: "Tarefa vence hoje",
  overdue: "Tarefa atrasada",
} as const;

const projectTitle = {
  tomorrow: "Projeto vence amanhã",
  today: "Projeto vence hoje",
  overdue: "Projeto atrasado",
} as const;

// Reminds people about deadlines that are tomorrow, today or just missed.
// Meant to run once a day, but every notification carries a dedupe key, so
// running it again (or twice by mistake) never notifies anyone twice.
export async function runDeadlineReminders(now: Date = new Date()) {
  const today = todayInAppZone(now);
  const dateFor = (offset: number) => new Date(today.getTime() + offset * DAY_MS);
  const counts = { tasks: 0, projects: 0, removed: 0 };
  const coordination = await coordinationIds();

  for (const { offset, phase } of phases) {
    const date = dateFor(offset);
    const day = toDateInput(date);

    const tasks = await prisma.task.findMany({
      where: {
        dueDate: date,
        assigneeId: { not: null },
        status: { notIn: CLOSED_TASK_STATUSES },
      },
      select: {
        id: true,
        title: true,
        assigneeId: true,
        projectId: true,
        project: { select: { title: true } },
      },
    });

    for (const task of tasks) {
      counts.tasks += await notifyUsers({
        userIds: [task.assigneeId as string],
        kind: "DEADLINE",
        title: `${taskTitle[phase]}: ${task.title}`,
        body: `Projeto "${task.project.title}" · prazo ${day.split("-").reverse().join("/")}`,
        href: `/kanban?projeto=${task.projectId}`,
        dedupeKey: `deadline:task:${task.id}:${day}:${phase}`,
      });
    }

    const projects = await prisma.project.findMany({
      where: {
        dueDate: date,
        status: { notIn: [ProjectStatus.FINISHED, ProjectStatus.CANCELED] },
      },
      select: { id: true, title: true },
    });

    for (const project of projects) {
      const team = await projectTeamIds(project.id);
      counts.projects += await notifyUsers({
        // the team does the work, coordination keeps an eye on it
        userIds: [...team, ...coordination],
        kind: "DEADLINE",
        title: `${projectTitle[phase]}: ${project.title}`,
        body: `Previsão de entrega ${day.split("-").reverse().join("/")}`,
        href: `/solicitacoes/${project.id}`,
        dedupeKey: `deadline:project:${project.id}:${day}:${phase}`,
      });
    }
  }

  // Housekeeping: read notifications go after 60 days, any after 180.
  const removed = await prisma.notification.deleteMany({
    where: {
      OR: [
        { readAt: { not: null, lt: new Date(now.getTime() - 60 * DAY_MS) } },
        { createdAt: { lt: new Date(now.getTime() - 180 * DAY_MS) } },
      ],
    },
  });
  counts.removed = removed.count;

  return counts;
}
