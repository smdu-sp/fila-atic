import { ProjectStatus } from "@prisma/client";

import { coordinationIds, notifyUsers, projectTeamIds } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  REOPEN_WINDOW_DAYS,
  REOPENABLE,
  REQUESTER_CANCELABLE,
} from "@/lib/requestLifecycleRules";
import {
  closeTasks,
  findOpenTasks,
  recordStatusChange,
} from "@/lib/projectStatus";

// What a requester can do with their own request, and the rules for it. The
// same functions serve people with an account and guests with a tracking link.
export {
  MAX_REASON_LENGTH,
  MIN_REASON_LENGTH,
  normalizeReason,
  REASON_ERROR,
  REOPEN_WINDOW_DAYS,
  REOPENABLE,
  REQUESTER_CANCELABLE,
} from "@/lib/requestLifecycleRules";

const DAY_MS = 86_400_000;

// Until when the requester may reopen a closed request; null when it cannot
// be reopened by them (still open, or too old).
export async function reopenDeadline(
  projectId: string,
  status: ProjectStatus,
  updatedAt: Date,
): Promise<Date | null> {
  if (!REOPENABLE.includes(status)) return null;

  const closedAt = await prisma.projectStatusChange.findFirst({
    where: { projectId, toStatus: status },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  return new Date(
    (closedAt?.createdAt ?? updatedAt).getTime() + REOPEN_WINDOW_DAYS * DAY_MS,
  );
}

// For screens: the deadline only while it is still in the future, so a page
// never offers "reopen" that the server would refuse.
export async function reopenUntilIfOpen(
  projectId: string,
  status: ProjectStatus,
  updatedAt: Date,
): Promise<Date | null> {
  const until = await reopenDeadline(projectId, status, updatedAt);
  return until && until.getTime() > Date.now() ? until : null;
}

type Actor = { id?: string; name: string };
type Outcome = { success: true } | { success: false; error: string };

// Tell the coordination and the project team (never the actor).
async function tellTheTeam(
  projectId: string,
  actor: Actor,
  title: string,
  body: string,
) {
  const [team, coordination] = await Promise.all([
    projectTeamIds(projectId),
    coordinationIds(),
  ]);

  await notifyUsers({
    userIds: [...team, ...coordination],
    kind: "STATUS_CHANGED",
    title,
    body,
    href: `/solicitacoes/${projectId}`,
    exceptUserId: actor.id,
  });
}

export async function requesterCancels(
  projectId: string,
  actor: Actor,
  reason: string,
): Promise<Outcome> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true, status: true },
  });

  if (!project) return { success: false, error: "Solicitacao nao encontrada" };
  if (!REQUESTER_CANCELABLE.includes(project.status)) {
    return {
      success: false,
      error:
        "Esta solicitacao ja esta em andamento ou encerrada. Fale com a equipe pelas mensagens",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.CANCELED, closeReason: reason },
    });
    await recordStatusChange(tx, {
      projectId,
      from: project.status,
      to: ProjectStatus.CANCELED,
      byName: actor.name,
    });
    // work that was planned for this request is off as well
    await closeTasks(
      tx,
      projectId,
      (await findOpenTasks(tx, projectId)).map((task) => task.id),
      actor.name,
    );
    // public: the requester sees it in the conversation
    await tx.projectLog.create({
      data: {
        projectId,
        message: `Solicitação cancelada por ${actor.name}. Motivo: ${reason}`,
        authorName: actor.name,
        isInternal: false,
      },
    });
  });

  await tellTheTeam(
    projectId,
    actor,
    `Solicitação cancelada pelo solicitante: ${project.title}`,
    reason,
  );

  return { success: true };
}

export async function requesterReopens(
  projectId: string,
  actor: Actor,
  reason: string,
): Promise<Outcome> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { title: true, status: true, updatedAt: true },
  });

  if (!project) return { success: false, error: "Solicitacao nao encontrada" };
  if (!REOPENABLE.includes(project.status)) {
    return { success: false, error: "Esta solicitacao ainda esta aberta" };
  }

  const until = await reopenDeadline(projectId, project.status, project.updatedAt);
  if (!until || until.getTime() < Date.now()) {
    return {
      success: false,
      error: `O prazo de ${REOPEN_WINDOW_DAYS} dias para reabrir terminou. Abra uma nova solicitacao`,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.IN_QUEUE, closeReason: null },
    });
    await recordStatusChange(tx, {
      projectId,
      from: project.status,
      to: ProjectStatus.IN_QUEUE,
      byName: actor.name,
    });
    await tx.projectLog.create({
      data: {
        projectId,
        message: `Solicitação reaberta por ${actor.name}. Motivo: ${reason}`,
        authorName: actor.name,
        isInternal: false,
      },
    });
  });

  await notifyUsers({
    userIds: await coordinationIds(),
    kind: "NEW_REQUEST",
    title: `Solicitação reaberta: ${project.title}`,
    body: reason,
    href: `/solicitacoes/${projectId}`,
    exceptUserId: actor.id,
  });

  return { success: true };
}
