import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStatus, Role, TaskStatus } from "@prisma/client";

import {
  confirmPublicRequest,
  createGuestMessage,
  submitPublicRequest,
} from "@/actions/publicRequestActions";
import {
  getNotificationSummary,
  markAllNotificationsRead,
  markNotificationRead,
  searchNotifications,
  setEmailNotifications,
} from "@/actions/notificationActions";
import { assignDeveloper, createProject, updateProject } from "@/actions/projectActions";
import { createProjectMessage, updateProjectStatusRestricted } from "@/actions/solicitacaoActions";
import { createTask, updateTask } from "@/actions/taskActions";
import { POST as cronPost } from "@/app/api/cron/deadline-reminders/route";
import { runDeadlineReminders } from "@/lib/deadlineReminders";
import { notifyUsers } from "@/lib/notifications";
import {
  actAs,
  assignToProject,
  mailsSent,
  makeProject,
  makeTask,
  makeUser,
  prisma,
  resetDb,
} from "../helpers";

beforeEach(resetDb);

const notificationsOf = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

async function setup() {
  const coord = await makeUser(Role.COORDINATOR);
  const lead = await makeUser(Role.TECH_LEAD);
  const dev2 = await makeUser(Role.DEV_GLOBAL);
  const dev1 = await makeUser(Role.DEV_RESTRICTED);
  const requester = await makeUser(Role.REQUESTER, { name: "Ana Solicitante" });
  const project = await makeProject(requester.id, { title: "Portal", status: ProjectStatus.IN_ANALYSIS });
  return { coord, lead, dev2, dev1, requester, project };
}

describe("creating notifications", () => {
  it("skips the actor, inactive people and guests", async () => {
    const { coord, dev2 } = await setup();
    const inactive = await makeUser(Role.DEV_GLOBAL, { isActive: false });
    const guest = await makeUser(Role.REQUESTER, { isGuest: true });

    const created = await notifyUsers({
      userIds: [coord.id, dev2.id, inactive.id, guest.id],
      kind: "MESSAGE",
      title: "Oi",
      href: "/x",
      exceptUserId: coord.id,
    });

    expect(created).toBe(1);
    expect(await notificationsOf(dev2.id)).toHaveLength(1);
    expect(await notificationsOf(coord.id)).toHaveLength(0);
    expect(await notificationsOf(inactive.id)).toHaveLength(0);
    expect(await notificationsOf(guest.id)).toHaveLength(0);
  });

  it("sends an e-mail with a link, unless the person turned e-mails off", async () => {
    const { dev2, dev1 } = await setup();
    await prisma.user.update({ where: { id: dev1.id }, data: { emailNotifications: false } });

    await notifyUsers({ userIds: [dev2.id, dev1.id], kind: "MESSAGE", title: "Aviso", body: "Detalhe", href: "/solicitacoes/abc" });

    // both get the in-app notice, only one gets the e-mail
    expect(await notificationsOf(dev2.id)).toHaveLength(1);
    expect(await notificationsOf(dev1.id)).toHaveLength(1);
    const mails = mailsSent();
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: dev2.email, subject: "Aviso" });
    expect(mails[0].text).toContain("/solicitacoes/abc");
    expect(mails[0].text).toContain("Detalhe");
  });

  it("does not repeat a notification with the same dedupe key", async () => {
    const { dev2 } = await setup();
    const input = { userIds: [dev2.id], kind: "DEADLINE" as const, title: "Prazo", href: "/x", dedupeKey: "k1" };

    expect(await notifyUsers(input)).toBe(1);
    expect(await notifyUsers(input)).toBe(0);
    expect(await notificationsOf(dev2.id)).toHaveLength(1);
    expect(mailsSent()).toHaveLength(1);
    // a different key is a different notice
    expect(await notifyUsers({ ...input, dedupeKey: "k2" })).toBe(1);
  });

  it("never fails the caller when the e-mail cannot be sent", async () => {
    const { dev2 } = await setup();
    const { sendMail } = await import("@/lib/mail");
    const { vi } = await import("vitest");
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("smtp down"));

    expect(await notifyUsers({ userIds: [dev2.id], kind: "MESSAGE", title: "Oi", href: "/x" })).toBe(1);
    expect(await notificationsOf(dev2.id)).toHaveLength(1);
  });
});

describe("events", () => {
  it("a new request notifies the whole coordination, not the requester", async () => {
    const { coord, lead, dev2, requester } = await setup();
    actAs(requester);

    await createProject({ title: "Novo sistema", description: "d", justification: "j" });

    for (const person of [coord, lead]) {
      const [n] = await notificationsOf(person.id);
      expect(n).toMatchObject({ kind: "NEW_REQUEST", title: "Nova solicitação: Novo sistema" });
      expect(n.body).toContain("Ana Solicitante");
    }
    expect(await notificationsOf(dev2.id)).toHaveLength(0);
    expect(await notificationsOf(requester.id)).toHaveLength(0);
  });

  it("a coordinator opening a request does not notify themselves", async () => {
    const { coord, lead } = await setup();
    actAs(coord);

    await createProject({ title: "Interno", description: "d", justification: "j" });

    expect(await notificationsOf(coord.id)).toHaveLength(0);
    expect(await notificationsOf(lead.id)).toHaveLength(1);
  });

  it("a confirmed public request notifies the coordination", async () => {
    const { coord } = await setup();
    await submitPublicRequest({
      name: "Maria Convidada", email: "maria@teste.gov.br", department: "Setor",
      title: "Pedido publico", description: "Descricao longa o bastante", justification: "Justificativa longa o bastante",
    });
    const token = /\/solicitar\/confirmar\/([A-Za-z0-9_-]+)/.exec(mailsSent().at(-1)?.text ?? "")?.[1] ?? "";
    await confirmPublicRequest(token);

    const [n] = await notificationsOf(coord.id);
    expect(n).toMatchObject({ kind: "NEW_REQUEST", title: "Nova solicitação: Pedido publico" });
  });

  it("assigning a developer to a project notifies them", async () => {
    const { coord, dev1, project } = await setup();
    actAs(coord);

    await assignDeveloper({ projectId: project.id, userId: dev1.id });

    const [n] = await notificationsOf(dev1.id);
    expect(n).toMatchObject({ kind: "PROJECT_ASSIGNED", href: `/solicitacoes/${project.id}` });
    expect(n.title).toContain("Portal");
  });

  it("giving someone a task notifies them; keeping it for yourself does not", async () => {
    const { coord, dev2, project } = await setup();
    actAs(coord);

    await createTask({ projectId: project.id, title: "Fazer login", assigneeId: dev2.id });
    const [n] = await notificationsOf(dev2.id);
    expect(n).toMatchObject({ kind: "TASK_ASSIGNED", title: "Nova tarefa para você: Fazer login", href: `/kanban?projeto=${project.id}` });
    expect(n.body).toContain("Portal");

    // reassigning notifies only the new owner
    const task = await makeTask(project.id, { title: "Outra", assigneeId: dev2.id });
    const lead = await makeUser(Role.DEV_GLOBAL);
    await updateTask({ id: task.id, assigneeId: lead.id });
    expect(await notificationsOf(lead.id)).toHaveLength(1);
    expect(await notificationsOf(dev2.id)).toHaveLength(1);

    // a coordinator taking the task themselves: no notice to self
    await updateTask({ id: task.id, assigneeId: coord.id });
    expect(await notificationsOf(coord.id)).toHaveLength(0);
  });

  it("a staff message reaches the requester; a requester message reaches the team", async () => {
    const { coord, dev1, dev2, requester, project } = await setup();
    await assignToProject(project.id, dev1.id);
    const form = (text: string) => {
      const data = new FormData();
      data.set("projectId", project.id);
      data.set("message", text);
      return data;
    };

    actAs(coord);
    await createProjectMessage(form("Resposta da equipe"));
    const [toRequester] = await notificationsOf(requester.id);
    expect(toRequester).toMatchObject({ kind: "MESSAGE", href: `/solicitacoes/${project.id}` });
    expect(toRequester.title).toContain("Portal");

    actAs(requester);
    await createProjectMessage(form("Minha duvida"));
    const toTeam = await notificationsOf(dev1.id);
    expect(toTeam.map((n) => n.title)).toEqual(["Nova mensagem de Ana Solicitante"]);
    // not the whole coordination when the project has a team
    expect(await notificationsOf(coord.id)).toHaveLength(0);
    expect(await notificationsOf(dev2.id)).toHaveLength(0);
  });

  it("with no team yet, the requester's message goes to the coordination", async () => {
    const { coord, lead, requester, project } = await setup();
    actAs(requester);
    const data = new FormData();
    data.set("projectId", project.id);
    data.set("message", "Alguem ai?");
    await createProjectMessage(data);

    expect(await notificationsOf(coord.id)).toHaveLength(1);
    expect(await notificationsOf(lead.id)).toHaveLength(1);
  });

  it("a guest's message reaches the team", async () => {
    const { dev1 } = await setup();
    await submitPublicRequest({
      name: "Maria Convidada", email: "maria@teste.gov.br", department: "Setor",
      title: "Pedido publico", description: "Descricao longa o bastante", justification: "Justificativa longa o bastante",
    });
    const token = /\/solicitar\/confirmar\/([A-Za-z0-9_-]+)/.exec(mailsSent().at(-1)?.text ?? "")?.[1] ?? "";
    const confirmed = await confirmPublicRequest(token);
    if (!confirmed.success) throw new Error(confirmed.error);
    const project = await prisma.project.findFirstOrThrow({ where: { title: "Pedido publico" } });
    await assignToProject(project.id, dev1.id);

    const data = new FormData();
    data.set("token", confirmed.data.trackingToken);
    data.set("message", "Tenho mais informacao");
    await createGuestMessage(data);

    expect((await notificationsOf(dev1.id)).map((n) => n.title)).toEqual(["Nova mensagem de Maria Convidada"]);
  });

  it("status and forecast changes reach a requester with an account, but not a guest", async () => {
    const { coord, requester, project } = await setup();
    const guest = await makeUser(Role.REQUESTER, { isGuest: true });
    const guestProject = await makeProject(guest.id, { title: "Do convidado" });
    actAs(coord);

    await updateProject({ id: project.id, status: ProjectStatus.IN_DEVELOPMENT, dueDate: "2026-11-20" });
    const titles = (await notificationsOf(requester.id)).map((n) => n.title);
    expect(titles).toContain('Status de "Portal": Em desenvolvimento');
    expect(titles).toContain('Previsão de entrega de "Portal": 20/11/2026');

    await updateProject({ id: project.id, dueDate: null });
    expect((await notificationsOf(requester.id)).map((n) => n.title)).toContain('Previsão de entrega de "Portal" removida');

    await updateProject({ id: guestProject.id, status: ProjectStatus.IN_DEVELOPMENT });
    expect(await notificationsOf(guest.id)).toHaveLength(0);
  });

  it("no notice when nothing changed", async () => {
    const { coord, requester, project } = await setup();
    actAs(coord);
    await updateProject({ id: project.id, priority: "HIGH" });
    expect(await notificationsOf(requester.id)).toHaveLength(0);
  });

  it("a restricted developer's status change also reaches the requester", async () => {
    const { dev1, requester, project } = await setup();
    await assignToProject(project.id, dev1.id);
    actAs(dev1);

    await updateProjectStatusRestricted(project.id, ProjectStatus.IN_TESTING);
    expect((await notificationsOf(requester.id))[0].title).toBe('Status de "Portal": Em testes');
  });
});

describe("notification actions", () => {
  async function withNotices(count: number) {
    const { dev2 } = await setup();
    for (let i = 0; i < count; i++) {
      await prisma.notification.create({
        data: { userId: dev2.id, kind: "MESSAGE", title: `Aviso ${i}`, href: "/x", createdAt: new Date(2026, 0, 1, 0, i) },
      });
    }
    actAs(dev2);
    return dev2;
  }

  it("summarizes unread notices, newest first, capped for the bell", async () => {
    await withNotices(12);
    const summary = await getNotificationSummary();
    expect(summary.success && summary.data.unread).toBe(12);
    expect(summary.success && summary.data.items).toHaveLength(8);
    expect(summary.success && summary.data.items[0].title).toBe("Aviso 11");
  });

  it("marks one notice as read, but only the caller's own", async () => {
    const dev2 = await withNotices(2);
    const other = await makeUser(Role.DEV_GLOBAL);
    const foreign = await prisma.notification.create({ data: { userId: other.id, kind: "MESSAGE", title: "De outro", href: "/x" } });
    const mine = await prisma.notification.findFirstOrThrow({ where: { userId: dev2.id } });

    await markNotificationRead(foreign.id);
    await markNotificationRead(mine.id);

    expect((await prisma.notification.findUniqueOrThrow({ where: { id: foreign.id } })).readAt).toBeNull();
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: mine.id } })).readAt).not.toBeNull();
    const summary = await getNotificationSummary();
    expect(summary.success && summary.data.unread).toBe(1);
  });

  it("marks everything as read", async () => {
    await withNotices(3);
    const result = await markAllNotificationsRead();
    expect(result.success && result.data.marked).toBe(3);
    const summary = await getNotificationSummary();
    expect(summary.success && summary.data.unread).toBe(0);
  });

  it("lists with an unread filter and pagination", async () => {
    const dev2 = await withNotices(25);
    const first = await prisma.notification.findFirstOrThrow({ where: { userId: dev2.id }, orderBy: { createdAt: "asc" } });
    await markNotificationRead(first.id);

    const all = await searchNotifications({});
    expect(all.success && all.data).toMatchObject({ total: 25, page: 1, pageCount: 2 });
    expect(all.success && all.data.items).toHaveLength(20);
    const unread = await searchNotifications({ unread: true });
    expect(unread.success && unread.data.total).toBe(24);
    const beyond = await searchNotifications({ page: 99 });
    expect(beyond.success && beyond.data.page).toBe(2);
  });

  it("stores the e-mail preference and requires a session", async () => {
    const dev2 = await withNotices(0);
    await setEmailNotifications(false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: dev2.id } })).emailNotifications).toBe(false);
    await setEmailNotifications(true);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: dev2.id } })).emailNotifications).toBe(true);

    actAs(null);
    expect(await getNotificationSummary()).toMatchObject({ success: false });
    expect(await markAllNotificationsRead()).toMatchObject({ success: false });
    expect(await setEmailNotifications(false)).toMatchObject({ success: false });
  });
});

describe("deadline reminders", () => {
  // 12:00 on Oct 5th in São Paulo
  const now = new Date("2026-10-05T15:00:00Z");
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  async function seed() {
    const s = await setup();
    const t = (title: string, due: string, extra: { status?: TaskStatus; assigneeId?: string | null } = {}) =>
      prisma.task.create({
        data: { projectId: s.project.id, title, dueDate: day(due), assigneeId: extra.assigneeId === undefined ? s.dev2.id : extra.assigneeId, status: extra.status ?? TaskStatus.IN_PROGRESS },
      });
    await t("Amanha", "2026-10-06");
    await t("Hoje", "2026-10-05");
    await t("Ontem", "2026-10-04");
    await t("Longe", "2026-10-20");
    await t("Retrasada", "2026-10-02");
    await t("Feita", "2026-10-06", { status: TaskStatus.DONE });
    await t("Sem dono", "2026-10-06", { assigneeId: null });
    return s;
  }

  it("reminds the assignee about tasks due tomorrow, today or yesterday only", async () => {
    const { dev2 } = await seed();
    const counts = await runDeadlineReminders(now);

    expect(counts.tasks).toBe(3);
    expect((await notificationsOf(dev2.id)).map((n) => n.title).sort()).toEqual([
      "Tarefa atrasada: Ontem",
      "Tarefa vence amanhã: Amanha",
      "Tarefa vence hoje: Hoje",
    ].sort());
  });

  it("is idempotent: running twice notifies once", async () => {
    const { dev2 } = await seed();
    await runDeadlineReminders(now);
    const second = await runDeadlineReminders(now);

    expect(second.tasks).toBe(0);
    expect(await notificationsOf(dev2.id)).toHaveLength(3);
  });

  it("does not repeat the overdue notice on later days, and reminds again on the next due date", async () => {
    const { dev2 } = await seed();
    await runDeadlineReminders(now);
    // next day: "Ontem" is now two days late (silent), "Hoje" became yesterday (overdue notice), "Longe" not yet
    await runDeadlineReminders(new Date("2026-10-06T15:00:00Z"));

    const titles = (await notificationsOf(dev2.id)).map((n) => n.title);
    expect(titles.filter((t) => t.includes("Ontem"))).toHaveLength(1);
    expect(titles.filter((t) => t.includes(": Hoje"))).toHaveLength(2); // "vence hoje" + "atrasado"
    expect(titles.filter((t) => t.includes("Amanha"))).toHaveLength(2); // "amanhã" + "hoje"
  });

  it("tells the team and the coordination about projects, and skips finished ones", async () => {
    const { coord, lead, dev1, dev2, requester, project } = await setup();
    await assignToProject(project.id, dev1.id);
    await prisma.project.update({ where: { id: project.id }, data: { dueDate: day("2026-10-06") } });
    const done = await makeProject(requester.id, { title: "Pronto", status: ProjectStatus.FINISHED });
    await prisma.project.update({ where: { id: done.id }, data: { dueDate: day("2026-10-06") } });

    const counts = await runDeadlineReminders(now);

    expect(counts.projects).toBe(3); // dev1, coord, lead
    for (const person of [dev1, coord, lead]) {
      expect((await notificationsOf(person.id)).map((n) => n.title)).toEqual(["Projeto vence amanhã: Portal"]);
    }
    expect(await notificationsOf(dev2.id)).toHaveLength(0);
    expect(await notificationsOf(requester.id)).toHaveLength(0);
  });

  it("cleans up old notifications", async () => {
    const { dev2 } = await setup();
    const make = (title: string, createdAt: string, readAt: string | null) =>
      prisma.notification.create({ data: { userId: dev2.id, kind: "MESSAGE", title, href: "/x", createdAt: new Date(createdAt), readAt: readAt ? new Date(readAt) : null } });
    await make("lida antiga", "2026-06-01T00:00:00Z", "2026-06-02T00:00:00Z"); // read > 60 days ago
    await make("nao lida recente", "2026-09-20T00:00:00Z", null);
    await make("lida recente", "2026-09-28T00:00:00Z", "2026-09-29T00:00:00Z");
    await make("nao lida muito antiga", "2026-01-01T00:00:00Z", null); // > 180 days

    const counts = await runDeadlineReminders(now);

    expect(counts.removed).toBe(2);
    expect((await notificationsOf(dev2.id)).map((n) => n.title).sort()).toEqual(["lida recente", "nao lida recente"]);
  });

  it("cleans up old mail log entries, keeping recent ones", async () => {
    await prisma.mailLog.createMany({
      data: [
        { kind: "notification", to: "a@x.gov.br", subject: "antigo", status: "sent", createdAt: new Date("2026-08-01T00:00:00Z") }, // > 30 days
        { kind: "notification", to: "b@x.gov.br", subject: "recente", status: "sent", createdAt: new Date("2026-09-28T00:00:00Z") },
      ],
    });

    const counts = await runDeadlineReminders(now);

    expect(counts.mailLogs).toBe(1);
    expect((await prisma.mailLog.findMany()).map((entry) => entry.subject)).toEqual(["recente"]);
  });
});

describe("scheduler endpoint", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  const call = (authorization?: string) =>
    cronPost(new Request("http://localhost/api/cron/deadline-reminders", { method: "POST", headers: authorization ? { authorization } : {} }));

  it("is disabled without CRON_SECRET", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer qualquer")).status).toBe(503);
  });

  it("refuses missing or wrong credentials", async () => {
    process.env.CRON_SECRET = "segredo-de-teste";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer errado")).status).toBe(401);
    expect((await call("segredo-de-teste")).status).toBe(401);
  });

  it("runs the job with the right secret", async () => {
    process.env.CRON_SECRET = "segredo-de-teste";
    const response = await call("Bearer segredo-de-teste");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, tasks: 0, projects: 0 });
  });
});
