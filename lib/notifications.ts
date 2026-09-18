import { Prisma } from "@prisma/client";

import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/publicRequest";
import { COORDINATION_ROLES } from "@/lib/roles";

// Notifications for people with an account. Guests (public form) have no
// account and are told by e-mail through lib/guestMail.ts instead.

export type NotificationKind =
  | "NEW_REQUEST"
  | "TASK_ASSIGNED"
  | "PROJECT_ASSIGNED"
  | "MESSAGE"
  | "STATUS_CHANGED"
  | "DUE_CHANGED"
  | "DEADLINE";

type NotifyInput = {
  userIds: string[];
  kind: NotificationKind;
  title: string;
  body?: string;
  // Path inside the app, e.g. /solicitacoes/<id>
  href: string;
  // Never notify the person who caused the event.
  exceptUserId?: string;
  // Makes the call idempotent: the same key is delivered once per person.
  dedupeKey?: string;
};

const SIGNATURE =
  "Fila ATIC - Secretaria Municipal de Urbanismo e Licenciamento";

async function emailNotification(
  user: { name: string; email: string },
  notification: { title: string; body?: string; href: string },
) {
  await sendMail({
    to: user.email,
    subject: notification.title,
    text: [
      `Olá, ${user.name}.`,
      "",
      notification.title,
      ...(notification.body ? [notification.body] : []),
      "",
      `Abrir no sistema: ${getAppUrl()}${notification.href}`,
      "",
      "Você recebe este aviso por ter uma conta no Fila ATIC. Para deixar de receber e-mails, desative em Perfil > Notificações. Os avisos continuam aparecendo no sistema.",
      "",
      SIGNATURE,
    ].join("\n"),
  });
}

// Creates one notification per recipient and e-mails those who did not opt
// out. Never throws: a failing notification must not break the action that
// caused it. Returns how many were created.
export async function notifyUsers(input: NotifyInput): Promise<number> {
  try {
    const ids = [...new Set(input.userIds)].filter(
      (id) => id !== input.exceptUserId,
    );
    if (ids.length === 0) return 0;

    const users = await prisma.user.findMany({
      where: { id: { in: ids }, isActive: true, isGuest: false },
      select: { id: true, name: true, email: true, emailNotifications: true },
    });

    const emails: Promise<unknown>[] = [];
    let created = 0;

    for (const user of users) {
      try {
        await prisma.notification.create({
          data: {
            userId: user.id,
            kind: input.kind,
            title: input.title,
            body: input.body ?? null,
            href: input.href,
            dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${user.id}` : null,
          },
        });
      } catch (error) {
        // unique dedupeKey: already delivered
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          continue;
        }
        throw error;
      }

      created++;

      if (user.emailNotifications && user.email) {
        emails.push(
          emailNotification(user, input).catch((error) =>
            console.error("Falha ao enviar e-mail de notificacao", error),
          ),
        );
      }
    }

    await Promise.all(emails);
    return created;
  } catch (error) {
    console.error("Falha ao criar notificacoes", error);
    return 0;
  }
}

const activePeople = { isActive: true, isGuest: false } as const;

export async function coordinationIds(): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { ...activePeople, role: { in: COORDINATION_ROLES } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

// The developers on the project; when nobody is assigned yet, coordination.
export async function projectTeamIds(projectId: string): Promise<string[]> {
  const team = await prisma.projectDeveloper.findMany({
    where: { projectId, user: activePeople },
    select: { userId: true },
  });

  return team.length ? team.map((entry) => entry.userId) : coordinationIds();
}

const projectHref = (projectId: string) => `/solicitacoes/${projectId}`;

export async function notifyNewRequest(input: {
  projectId: string;
  title: string;
  requesterName: string;
  department: string;
  exceptUserId?: string;
}) {
  return notifyUsers({
    userIds: await coordinationIds(),
    kind: "NEW_REQUEST",
    title: `Nova solicitação: ${input.title}`,
    body: [input.requesterName, input.department].filter(Boolean).join(" · "),
    href: projectHref(input.projectId),
    exceptUserId: input.exceptUserId,
  });
}

export async function notifyProjectAssigned(input: {
  projectId: string;
  title: string;
  userId: string;
  exceptUserId?: string;
}) {
  return notifyUsers({
    userIds: [input.userId],
    kind: "PROJECT_ASSIGNED",
    title: `Você foi adicionado ao projeto "${input.title}"`,
    href: projectHref(input.projectId),
    exceptUserId: input.exceptUserId,
  });
}

export async function notifyTaskAssigned(input: {
  projectId: string;
  projectTitle: string;
  taskTitle: string;
  userId: string;
  exceptUserId?: string;
}) {
  return notifyUsers({
    userIds: [input.userId],
    kind: "TASK_ASSIGNED",
    title: `Nova tarefa para você: ${input.taskTitle}`,
    body: `Projeto "${input.projectTitle}"`,
    href: `/kanban?projeto=${input.projectId}`,
    exceptUserId: input.exceptUserId,
  });
}

// Something changed on a project the requester follows. Guests are not
// handled here: they are told by e-mail (notifyGuestRequester).
export async function notifyRequesterOf(input: {
  projectId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  exceptUserId?: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { title: true, requesterId: true },
  });
  if (!project) return 0;

  return notifyUsers({
    userIds: [project.requesterId],
    kind: input.kind,
    title: input.title.replace("{projeto}", project.title),
    body: input.body,
    href: projectHref(input.projectId),
    exceptUserId: input.exceptUserId,
  });
}

export async function notifyTeamOfRequesterMessage(input: {
  projectId: string;
  fromName: string;
  exceptUserId?: string;
}) {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { title: true },
  });
  if (!project) return 0;

  return notifyUsers({
    userIds: await projectTeamIds(input.projectId),
    kind: "MESSAGE",
    title: `Nova mensagem de ${input.fromName}`,
    body: `Projeto "${project.title}"`,
    href: projectHref(input.projectId),
    exceptUserId: input.exceptUserId,
  });
}
