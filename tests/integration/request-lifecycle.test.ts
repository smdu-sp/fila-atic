import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectStatus, Role, TaskStatus } from "@prisma/client";

import {
  cancelGuestRequest,
  confirmPublicRequest,
  reopenGuestRequest,
  resendTrackingLinks,
  submitPublicRequest,
  submitPublicRequestForm,
} from "@/actions/publicRequestActions";
import { updateProject } from "@/actions/projectActions";
import {
  addRequestAttachments,
  cancelMyRequest,
  reopenMyRequest,
} from "@/actions/requestLifecycleActions";
import {
  getProjectDetails,
  listProjectMessages,
  updateProjectStatusRestricted,
} from "@/actions/solicitacaoActions";
import { removeExpiredPending } from "@/lib/pendingRequests";
import { deleteUploads } from "@/lib/uploads";
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

// No files should reach the disk during tests: uploads are faked, validation
// stays real.
vi.mock("@/lib/uploads", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/uploads")>();
  return {
    ...original,
    saveUploads: vi.fn(async (files: File[]) =>
      files.map((file) => ({
        fileName: file.name,
        fileUrl: `/uploads/fake-${file.name}`,
        fileType: file.type || null,
        fileSize: file.size,
      })),
    ),
    deleteUploads: vi.fn(async () => undefined),
  };
});

beforeEach(async () => {
  await resetDb();
  vi.mocked(deleteUploads).mockClear();
});

const REASON = "Nao precisamos mais dessa entrega";
const DAY = 86_400_000;

const notificationsOf = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

async function setup() {
  const coord = await makeUser(Role.COORDINATOR);
  const lead = await makeUser(Role.TECH_LEAD);
  const dev1 = await makeUser(Role.DEV_RESTRICTED);
  const dev2 = await makeUser(Role.DEV_GLOBAL);
  const requester = await makeUser(Role.REQUESTER, { name: "Ana Solicitante" });
  const other = await makeUser(Role.REQUESTER);
  return { coord, lead, dev1, dev2, requester, other };
}

// A project already closed `daysAgo` days ago.
async function closedProject(requesterId: string, status: ProjectStatus, daysAgo: number, extra = {}) {
  const project = await makeProject(requesterId, { status, ...extra });
  await prisma.projectStatusChange.create({
    data: { projectId: project.id, fromStatus: ProjectStatus.IN_DEVELOPMENT, toStatus: status, changedByName: "Sistema", createdAt: new Date(Date.now() - daysAgo * DAY) },
  });
  return project;
}

describe("the requester cancels", () => {
  it.each([ProjectStatus.IN_QUEUE, ProjectStatus.IN_ANALYSIS])("while the request is %s", async (status) => {
    const { coord, lead, dev1, dev2, requester } = await setup();
    const project = await makeProject(requester.id, { status });
    await assignToProject(project.id, dev1.id);
    await makeTask(project.id, { title: "Planejada" });
    actAs(requester);

    expect(await cancelMyRequest({ projectId: project.id, reason: REASON })).toMatchObject({ success: true });

    const saved = await prisma.project.findUniqueOrThrow({ where: { id: project.id } });
    expect(saved).toMatchObject({ status: ProjectStatus.CANCELED, closeReason: REASON });
    expect((await prisma.task.findFirstOrThrow()).status).toBe(TaskStatus.CANCELED);
    expect((await prisma.projectStatusChange.findFirstOrThrow({ where: { projectId: project.id } })).toStatus).toBe(ProjectStatus.CANCELED);

    // the reason is public: it is in the conversation the requester reads
    const messages = await listProjectMessages(project.id);
    expect(messages.success && messages.data.map((m) => m.message)).toContain(`Solicitação cancelada por Ana Solicitante. Motivo: ${REASON}`);

    // the team and the coordination hear about it, the actor does not
    for (const person of [dev1, coord, lead]) {
      expect((await notificationsOf(person.id)).map((n) => n.title)).toContain("Solicitação cancelada pelo solicitante: Projeto de teste");
    }
    expect(await notificationsOf(dev2.id)).toHaveLength(0);
    expect(await notificationsOf(requester.id)).toHaveLength(0);
  });

  it("only before development starts", async () => {
    const { requester } = await setup();
    actAs(requester);
    for (const status of [ProjectStatus.IN_DEVELOPMENT, ProjectStatus.IN_TESTING, ProjectStatus.FINISHED]) {
      const project = await makeProject(requester.id, { status });
      expect(await cancelMyRequest({ projectId: project.id, reason: REASON })).toMatchObject({ success: false });
    }
  });

  it("with a real reason, and only their own request", async () => {
    const { coord, requester, other } = await setup();
    const project = await makeProject(requester.id);

    actAs(requester);
    expect(await cancelMyRequest({ projectId: project.id, reason: "ok" })).toMatchObject({ success: false });
    expect(await cancelMyRequest({ projectId: project.id, reason: "   " })).toMatchObject({ success: false });

    actAs(other);
    expect(await cancelMyRequest({ projectId: project.id, reason: REASON })).toMatchObject({ success: false });
    actAs(coord); // staff use the status form, not this action
    expect(await cancelMyRequest({ projectId: project.id, reason: REASON })).toMatchObject({ success: false });

    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe(ProjectStatus.IN_QUEUE);
  });
});

describe("a guest cancels and reopens through the link", () => {
  async function guestProject(status: ProjectStatus = ProjectStatus.IN_QUEUE) {
    const guest = await makeUser(Role.REQUESTER, { isGuest: true, name: "Maria Convidada" });
    const token = "g".repeat(43);
    const project = await makeProject(guest.id, { status, trackingToken: token });
    return { guest, token, project };
  }

  it("cancels with the token, a reason, and not with a wrong token", async () => {
    const { coord } = await setup();
    const { token, project } = await guestProject();

    expect(await cancelGuestRequest("x".repeat(43), REASON)).toMatchObject({ success: false });
    expect(await cancelGuestRequest(token, "no")).toMatchObject({ success: false });
    expect(await cancelGuestRequest(token, REASON)).toMatchObject({ success: true });

    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ status: ProjectStatus.CANCELED, closeReason: REASON });
    expect((await notificationsOf(coord.id)).some((n) => n.title.startsWith("Solicitação cancelada pelo solicitante"))).toBe(true);
    // already cancelled: cannot cancel again
    expect(await cancelGuestRequest(token, REASON)).toMatchObject({ success: false });
  });

  it("reopens within the window, and puts the request back in the queue", async () => {
    const { coord } = await setup();
    const { token, project } = await guestProject(ProjectStatus.CANCELED);
    await prisma.project.update({ where: { id: project.id }, data: { closeReason: "antigo motivo" } });
    await prisma.projectStatusChange.create({ data: { projectId: project.id, fromStatus: ProjectStatus.IN_QUEUE, toStatus: ProjectStatus.CANCELED, changedByName: "x" } });

    expect(await reopenGuestRequest(token, "Voltamos a precisar disso")).toMatchObject({ success: true });

    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ status: ProjectStatus.IN_QUEUE, closeReason: null });
    expect((await notificationsOf(coord.id)).some((n) => n.title === "Solicitação reaberta: Projeto de teste")).toBe(true);
    // it is open now
    expect(await reopenGuestRequest(token, "Voltamos a precisar disso")).toMatchObject({ success: false });
  });
});

describe("reopening", () => {
  it("works for finished and cancelled requests up to 30 days after they closed", async () => {
    const { requester } = await setup();
    actAs(requester);

    for (const status of [ProjectStatus.FINISHED, ProjectStatus.CANCELED]) {
      const project = await closedProject(requester.id, status, 29);
      expect(await reopenMyRequest({ projectId: project.id, reason: "Precisamos de ajustes" })).toMatchObject({ success: true });
      expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe(ProjectStatus.IN_QUEUE);
    }
  });

  it("not after 30 days, not while open, not someone else's, and needs a reason", async () => {
    const { requester, other } = await setup();
    const old = await closedProject(requester.id, ProjectStatus.FINISHED, 31);
    const fresh = await closedProject(requester.id, ProjectStatus.FINISHED, 1);
    const open = await makeProject(requester.id);

    actAs(requester);
    expect(await reopenMyRequest({ projectId: old.id, reason: "Precisamos de ajustes" })).toMatchObject({ success: false });
    expect(await reopenMyRequest({ projectId: open.id, reason: "Precisamos de ajustes" })).toMatchObject({ success: false });
    expect(await reopenMyRequest({ projectId: fresh.id, reason: "x" })).toMatchObject({ success: false });
    actAs(other);
    expect(await reopenMyRequest({ projectId: fresh.id, reason: "Precisamos de ajustes" })).toMatchObject({ success: false });
  });

  it("records the reopening in the history and in the public conversation", async () => {
    const { requester } = await setup();
    const project = await closedProject(requester.id, ProjectStatus.CANCELED, 2);
    actAs(requester);

    await reopenMyRequest({ projectId: project.id, reason: "Precisamos de ajustes" });

    expect((await prisma.projectStatusChange.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }))[0].toStatus).toBe(ProjectStatus.IN_QUEUE);
    const messages = await listProjectMessages(project.id);
    expect(messages.success && messages.data.at(-1)?.message).toBe("Solicitação reaberta por Ana Solicitante. Motivo: Precisamos de ajustes");
  });

  it("the details tell the screen whether the button should appear", async () => {
    const { requester } = await setup();
    const open = await makeProject(requester.id);
    const recent = await closedProject(requester.id, ProjectStatus.FINISHED, 5);
    const old = await closedProject(requester.id, ProjectStatus.FINISHED, 40);
    actAs(requester);

    const until = async (id: string) => {
      const d = await getProjectDetails(id);
      return d.success ? d.data.reopenUntil : "erro";
    };
    expect(await until(open.id)).toBeNull();
    expect(await until(old.id)).toBeNull();
    const date = (await until(recent.id)) as Date;
    expect(date.getTime()).toBeGreaterThan(Date.now() + 24 * DAY);
  });
});

describe("the team cancels: a reason is mandatory and the requester reads it", () => {
  it("asks for it, then stores it and tells the requester", async () => {
    const { coord, requester } = await setup();
    const project = await makeProject(requester.id, { status: ProjectStatus.IN_ANALYSIS });
    actAs(coord);

    const refused = await updateProject({ id: project.id, status: ProjectStatus.CANCELED });
    expect(refused).toMatchObject({ success: false, needsReason: true });
    expect(await updateProject({ id: project.id, status: ProjectStatus.CANCELED, closeReason: "no" })).toMatchObject({ success: false, needsReason: true });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe(ProjectStatus.IN_ANALYSIS);

    expect(await updateProject({ id: project.id, status: ProjectStatus.CANCELED, closeReason: "Fora do escopo desta area" })).toMatchObject({ success: true });
    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ status: ProjectStatus.CANCELED, closeReason: "Fora do escopo desta area" });

    const messages = await (async () => { actAs(requester); return listProjectMessages(project.id); })();
    expect(messages.success && messages.data.at(-1)?.message).toBe("Solicitação cancelada pela equipe. Motivo: Fora do escopo desta area");
    const [n] = await notificationsOf(requester.id);
    expect(n).toMatchObject({ kind: "STATUS_CHANGED", body: "Fora do escopo desta area" });
  });

  it("applies to restricted developers as well", async () => {
    const { dev1, requester } = await setup();
    const project = await makeProject(requester.id, { status: ProjectStatus.IN_DEVELOPMENT });
    await assignToProject(project.id, dev1.id);
    actAs(dev1);

    expect(await updateProjectStatusRestricted(project.id, ProjectStatus.CANCELED)).toMatchObject({ success: false, needsReason: true });
    expect(await updateProjectStatusRestricted(project.id, ProjectStatus.CANCELED, { closeReason: "Priorizamos outra entrega" })).toMatchObject({ success: true });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).closeReason).toBe("Priorizamos outra entrega");
  });

  it("asks for the reason before it asks about open tasks, and leaving 'cancelled' clears it", async () => {
    const { coord, requester } = await setup();
    const project = await makeProject(requester.id, { status: ProjectStatus.IN_DEVELOPMENT });
    await makeTask(project.id, { title: "Aberta" });
    actAs(coord);

    expect(await updateProject({ id: project.id, status: ProjectStatus.CANCELED })).toMatchObject({ needsReason: true });
    const tasks = await updateProject({ id: project.id, status: ProjectStatus.CANCELED, closeReason: "Fora do escopo desta area" });
    expect(tasks).toMatchObject({ success: false });
    expect(!tasks.success && tasks.openTasks).toHaveLength(1);

    await updateProject({ id: project.id, status: ProjectStatus.CANCELED, closeReason: "Fora do escopo desta area", closeOpenTasks: true });
    await updateProject({ id: project.id, status: ProjectStatus.IN_ANALYSIS });
    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ status: ProjectStatus.IN_ANALYSIS, closeReason: null });
  });
});

describe("attachments when opening a request", () => {
  const file = (name: string, type = "application/pdf") => new File(["conteudo"], name, { type });

  it("are added by the requester, as a public message with the files", async () => {
    const { requester, other } = await setup();
    const project = await makeProject(requester.id);
    const form = (...files: File[]) => {
      const data = new FormData();
      data.set("projectId", project.id);
      files.forEach((f) => data.append("attachments", f));
      return data;
    };

    actAs(requester);
    expect(await addRequestAttachments(form(file("escopo.pdf"), file("tela.png", "image/png")))).toMatchObject({ success: true });
    const log = await prisma.projectLog.findFirstOrThrow({ where: { projectId: project.id }, include: { attachments: true } });
    expect(log).toMatchObject({ isInternal: false, authorName: "Ana Solicitante" });
    expect(log.attachments.map((a) => a.fileName).sort()).toEqual(["escopo.pdf", "tela.png"]);

    expect(await addRequestAttachments(form())).toMatchObject({ success: false });
    expect(await addRequestAttachments(form(file("x.html", "text/html")))).toMatchObject({ success: false });
    actAs(other);
    expect(await addRequestAttachments(form(file("escopo.pdf")))).toMatchObject({ success: false });
  });

  const payload = {
    name: "Maria Convidada", email: "maria@teste.gov.br", department: "Setor",
    title: "Pedido com anexo", description: "Descricao longa o bastante", justification: "Justificativa longa o bastante",
  };
  const publicForm = (files: File[], body: unknown = payload) => {
    const data = new FormData();
    data.set("payload", JSON.stringify(body));
    files.forEach((f) => data.append("attachments", f));
    return data;
  };
  const tokenFromMail = () => /\/solicitar\/confirmar\/([A-Za-z0-9_-]+)/.exec(mailsSent().at(-1)?.text ?? "")?.[1] ?? "";

  it("travel with the public form and become the first message once confirmed", async () => {
    await setup();
    expect(await submitPublicRequestForm(publicForm([file("escopo.pdf")]))).toMatchObject({ success: true });

    const pending = await prisma.pendingGuestRequest.findFirstOrThrow();
    expect(JSON.parse(pending.attachments ?? "[]")).toHaveLength(1);
    expect(await prisma.projectLogAttachment.count()).toBe(0); // nothing official yet

    await confirmPublicRequest(tokenFromMail());
    const attachment = await prisma.projectLogAttachment.findFirstOrThrow({ include: { log: true } });
    expect(attachment).toMatchObject({ fileName: "escopo.pdf" });
    expect(attachment.log).toMatchObject({ isInternal: false, message: "Anexos enviados na abertura da solicitação." });
  });

  it("are validated, and refused files never reach the queue", async () => {
    await setup();
    expect(await submitPublicRequestForm(publicForm([file("x.html", "text/html")]))).toMatchObject({ success: false });
    expect(await submitPublicRequestForm(publicForm([file("a.pdf"), file("b.pdf"), file("c.pdf"), file("d.pdf")]))).toMatchObject({ success: false });
    expect(await submitPublicRequestForm(new FormData())).toMatchObject({ success: false });
    expect(await prisma.pendingGuestRequest.count()).toBe(0);
  });

  it("are deleted with a request that expires without confirmation", async () => {
    await setup();
    await submitPublicRequestForm(publicForm([file("escopo.pdf")]));
    await prisma.pendingGuestRequest.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await removeExpiredPending()).toBe(1);
    expect(await prisma.pendingGuestRequest.count()).toBe(0);
    expect(vi.mocked(deleteUploads)).toHaveBeenCalledWith(["/uploads/fake-escopo.pdf"]);
  });

  it("the plain JSON form keeps working without files", async () => {
    await setup();
    expect(await submitPublicRequest(payload)).toMatchObject({ success: true });
  });
});

describe("resending tracking links", () => {
  async function guestWith(title: string, status: ProjectStatus, ageDays: number, token: string) {
    const guest =
      (await prisma.user.findFirst({ where: { email: "maria@teste.gov.br" } })) ??
      (await makeUser(Role.REQUESTER, { isGuest: true, email: "maria@teste.gov.br", name: "Maria Convidada" }));
    const project = await makeProject(guest.id, { title, status, trackingToken: token });
    await prisma.$executeRaw`update "Project" set "updatedAt" = ${new Date(Date.now() - ageDays * DAY)} where id = ${project.id}`;
    return project;
  }

  it("e-mails the links of open and recently closed requests only", async () => {
    await guestWith("Aberta", ProjectStatus.IN_ANALYSIS, 100, "a".repeat(43));
    await guestWith("Fechada recente", ProjectStatus.FINISHED, 10, "b".repeat(43));
    await guestWith("Fechada antiga", ProjectStatus.FINISHED, 200, "c".repeat(43));

    expect(await resendTrackingLinks("Maria@Teste.gov.br")).toMatchObject({ success: true });

    const [mail] = mailsSent();
    expect(mail.to).toBe("maria@teste.gov.br");
    expect(mail.text).toContain("Aberta");
    expect(mail.text).toContain(`/acompanhar/${"a".repeat(43)}`);
    expect(mail.text).toContain("Fechada recente");
    expect(mail.text).not.toContain("Fechada antiga");
  });

  it("answers the same whether or not the address has requests, or is allowed", async () => {
    await guestWith("Aberta", ProjectStatus.IN_ANALYSIS, 1, "a".repeat(43));

    expect(await resendTrackingLinks("ninguem@teste.gov.br")).toMatchObject({ success: true });
    expect(await resendTrackingLinks("alguem@gmail.com")).toMatchObject({ success: true });
    expect(mailsSent()).toHaveLength(0);
    expect(await resendTrackingLinks("nao-e-email")).toMatchObject({ success: false });
  });

  it("limits how often one address can be asked", async () => {
    await guestWith("Aberta", ProjectStatus.IN_ANALYSIS, 1, "a".repeat(43));
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await resendTrackingLinks("maria@teste.gov.br")).success);

    expect(results).toEqual([true, true, true, false]);
    expect(mailsSent()).toHaveLength(3);
  });
});
