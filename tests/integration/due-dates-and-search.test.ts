import { beforeEach, describe, expect, it } from "vitest";
import { ProjectPriority, ProjectStatus, Role, TaskStatus } from "@prisma/client";

import { listProjects, searchProjects, updateProject } from "@/actions/projectActions";
import { getProjectDetails } from "@/actions/solicitacaoActions";
import { queueStats, searchQueue } from "@/actions/queueActions";
import { searchProjectLogs } from "@/actions/logActions";
import { createTask, listMyTasks, listTasksByProject, updateTask } from "@/actions/taskActions";
import { toDateInput } from "@/lib/dueDate";
import { PAGE_SIZE } from "@/lib/listParams";
import { actAs, assignToProject, makeProject, makeTask, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function setup() {
  const coord = await makeUser(Role.COORDINATOR);
  const dev2 = await makeUser(Role.DEV_GLOBAL);
  const dev1 = await makeUser(Role.DEV_RESTRICTED);
  const requester = await makeUser(Role.REQUESTER, { name: "Ana Solicitante" });
  const project = await makeProject(requester.id, { status: ProjectStatus.IN_DEVELOPMENT });
  return { coord, dev2, dev1, requester, project };
}

describe("project due date", () => {
  it("is set, changed and cleared by managers, and every change is logged", async () => {
    const { coord, project } = await setup();
    actAs(coord);

    expect(await updateProject({ id: project.id, dueDate: "2026-11-20" })).toMatchObject({ success: true });
    expect(toDateInput((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).dueDate)).toBe("2026-11-20");

    // untouched when not sent
    await updateProject({ id: project.id, priority: ProjectPriority.HIGH });
    expect(toDateInput((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).dueDate)).toBe("2026-11-20");

    await updateProject({ id: project.id, dueDate: "2026-12-01" });
    await updateProject({ id: project.id, dueDate: null });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).dueDate).toBeNull();

    const messages = (await prisma.projectLog.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" } })).map((l) => l.message);
    expect(messages.some((m) => m.includes("Previsao: sem previsao -> 20/11/2026"))).toBe(true);
    expect(messages.some((m) => m.includes("Previsao: 20/11/2026 -> 01/12/2026"))).toBe(true);
    expect(messages.some((m) => m.includes("Previsao: 01/12/2026 -> sem previsao"))).toBe(true);
  });

  it("rejects invalid dates and is not available to restricted developers", async () => {
    const { coord, dev1, project } = await setup();
    await assignToProject(project.id, dev1.id);

    actAs(coord);
    expect(await updateProject({ id: project.id, dueDate: "31/12/2026" })).toMatchObject({ success: false });

    actAs(dev1);
    expect(await updateProject({ id: project.id, dueDate: "2026-11-20" })).toMatchObject({ success: false });
  });

  it("is visible to the requester in the project details", async () => {
    const { coord, requester, project } = await setup();
    actAs(coord);
    await updateProject({ id: project.id, dueDate: "2026-11-20" });

    actAs(requester);
    const details = await getProjectDetails(project.id);
    expect(details.success && toDateInput(details.data.dueDate)).toBe("2026-11-20");
  });
});

describe("task due date", () => {
  it("is set at creation and changed later, with log entries", async () => {
    const { coord, project } = await setup();
    actAs(coord);

    const created = await createTask({ projectId: project.id, title: "Com prazo", dueDate: "2026-10-30" });
    if (!created.success) throw new Error(created.error);
    expect(toDateInput((await prisma.task.findUniqueOrThrow({ where: { id: created.data } })).dueDate)).toBe("2026-10-30");

    await updateTask({ id: created.data, dueDate: "2026-11-05" });
    await updateTask({ id: created.data, dueDate: null });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: created.data } })).dueDate).toBeNull();

    const messages = (await prisma.projectLog.findMany({ where: { projectId: project.id } })).map((l) => l.message);
    expect(messages.some((m) => m.includes("Prazo: 30/10/2026 -> 05/11/2026"))).toBe(true);
    expect(messages.some((m) => m.includes("Prazo: 05/11/2026 -> sem prazo"))).toBe(true);
  });

  it("rejects invalid dates, on create and on update", async () => {
    const { coord, project } = await setup();
    const task = await makeTask(project.id);
    actAs(coord);

    expect(await createTask({ projectId: project.id, title: "X", dueDate: "amanha" })).toMatchObject({ success: false });
    expect(await updateTask({ id: task.id, dueDate: "2026-02-31" })).toMatchObject({ success: false });
  });

  it("comes back in the task lists", async () => {
    const { coord, dev2, project } = await setup();
    await prisma.task.create({ data: { projectId: project.id, title: "T", dueDate: new Date("2026-10-30T00:00:00Z"), assigneeId: dev2.id } });

    actAs(coord);
    const byProject = await listTasksByProject(project.id);
    expect(byProject.success && toDateInput(byProject.data[0].dueDate)).toBe("2026-10-30");

    actAs(dev2);
    const mine = await listMyTasks();
    expect(mine.success && toDateInput(mine.data[0].dueDate)).toBe("2026-10-30");
  });
});

describe("searchProjects", () => {
  async function seed() {
    const { coord, dev1, dev2, requester } = await setup();
    const other = await makeUser(Role.REQUESTER, { name: "Bruno Outro" });
    await prisma.user.update({ where: { id: other.id }, data: { department: "Habitacao" } });
    const a = await makeProject(requester.id, { title: "Sistema de protocolo", status: ProjectStatus.IN_QUEUE, priority: ProjectPriority.LOW });
    const b = await makeProject(other.id, { title: "Portal do cidadao", status: ProjectStatus.IN_DEVELOPMENT, priority: ProjectPriority.URGENT });
    const c = await makeProject(other.id, { title: "Relatorio mensal", status: ProjectStatus.FINISHED, priority: ProjectPriority.MEDIUM });
    await prisma.project.update({ where: { id: a.id }, data: { dueDate: new Date(`${day(-5)}T00:00:00Z`) } });
    await prisma.project.update({ where: { id: b.id }, data: { dueDate: new Date(`${day(10)}T00:00:00Z`) } });
    await prisma.project.update({ where: { id: c.id }, data: { dueDate: new Date(`${day(-30)}T00:00:00Z`) } });
    return { coord, dev1, dev2, requester, other, a, b, c };
  }
  const titles = (r: Awaited<ReturnType<typeof searchProjects>>) => (r.success ? r.data.items.map((p) => p.title) : []);

  it("filters by text (title, requester, department), status and priority", async () => {
    const { coord } = await seed();
    actAs(coord);

    expect(titles(await searchProjects({ q: "PROTOCOLO" }))).toEqual(["Sistema de protocolo"]);
    expect(titles(await searchProjects({ q: "bruno" })).sort()).toEqual(["Portal do cidadao", "Relatorio mensal"]);
    expect(titles(await searchProjects({ q: "habitacao" })).sort()).toEqual(["Portal do cidadao", "Relatorio mensal"]);
    expect(titles(await searchProjects({ status: ProjectStatus.FINISHED }))).toEqual(["Relatorio mensal"]);
    expect(titles(await searchProjects({ priority: ProjectPriority.URGENT }))).toEqual(["Portal do cidadao"]);
    expect(titles(await searchProjects({ q: "nao existe" }))).toEqual([]);
  });

  it("finds only projects that are late and still open", async () => {
    const { coord } = await seed();
    actAs(coord);
    // "Relatorio mensal" is past due too, but it is finished
    expect(titles(await searchProjects({ overdue: true }))).toEqual(["Sistema de protocolo"]);
  });

  it("sorts by due date with undated projects last", async () => {
    const { coord, requester } = await seed();
    await makeProject(requester.id, { title: "Sem previsao" });
    actAs(coord);

    expect(titles(await searchProjects({ sort: "due" }))).toEqual([
      "Relatorio mensal",
      "Sistema de protocolo",
      "Portal do cidadao",
      "Sem previsao",
      "Projeto de teste", // created by setup(), also without a date; older than the one above
    ]);
  });

  it("filters by developer on the team", async () => {
    const { coord, dev2, b } = await seed();
    await assignToProject(b.id, dev2.id);
    actAs(coord);
    expect(titles(await searchProjects({ developerId: dev2.id }))).toEqual(["Portal do cidadao"]);
  });

  it("respects who can see what, whatever the filters", async () => {
    const { dev1, requester, b } = await seed();
    await assignToProject(b.id, dev1.id);

    actAs(requester);
    expect(titles(await searchProjects({ q: "portal" }))).toEqual([]); // not theirs
    expect(titles(await searchProjects({})).sort()).toEqual(["Projeto de teste", "Sistema de protocolo"]);

    actAs(dev1);
    expect(titles(await searchProjects({}))).toEqual(["Portal do cidadao"]);
  });

  it("paginates and clamps out-of-range pages", async () => {
    const { coord, requester } = await setup();
    for (let i = 0; i < PAGE_SIZE + 5; i++) {
      await prisma.project.create({
        data: { title: `Lote ${String(i).padStart(2, "0")}`, description: "d", justification: "j", requesterId: requester.id, createdAt: new Date(2026, 0, 1, 0, i) },
      });
    }
    actAs(coord);

    const first = await searchProjects({ q: "Lote" });
    expect(first.success && first.data).toMatchObject({ total: PAGE_SIZE + 5, page: 1, pageCount: 2 });
    expect(first.success && first.data.items).toHaveLength(PAGE_SIZE);

    const second = await searchProjects({ q: "Lote", page: 2 });
    expect(second.success && second.data.items).toHaveLength(5);

    const beyond = await searchProjects({ q: "Lote", page: 99 });
    expect(beyond.success && beyond.data.page).toBe(2);

    // the plain listing (Kanban, dashboard) is not paginated
    const all = await listProjects();
    expect(all.success && all.data.length).toBeGreaterThan(PAGE_SIZE);
  });

  it("carries the due date and task progress", async () => {
    const { coord, project } = await setup();
    await prisma.project.update({ where: { id: project.id }, data: { dueDate: new Date("2026-11-20T00:00:00Z") } });
    await makeTask(project.id, { status: TaskStatus.DONE });
    await makeTask(project.id);
    actAs(coord);

    const result = await searchProjects({});
    expect(result.success && result.data.items[0]).toMatchObject({ taskTotal: 2, taskDone: 1 });
    expect(result.success && toDateInput(result.data.items[0].dueDate)).toBe("2026-11-20");
  });
});

describe("queue search", () => {
  it("is for coordinators, only lists the queue and orders by wait or priority", async () => {
    const { coord, dev2, requester } = await setup();
    const older = await makeProject(requester.id, { title: "Antigo", priority: ProjectPriority.LOW });
    const urgent = await makeProject(requester.id, { title: "Urgente", priority: ProjectPriority.URGENT });
    await makeProject(requester.id, { title: "Em analise", status: ProjectStatus.IN_ANALYSIS });
    await prisma.project.update({ where: { id: older.id }, data: { createdAt: new Date("2026-01-01") } });
    await prisma.project.update({ where: { id: urgent.id }, data: { createdAt: new Date("2026-06-01") } });

    actAs(dev2);
    expect(await searchQueue()).toMatchObject({ success: false });
    expect(await queueStats()).toMatchObject({ success: false });

    actAs(coord);
    const byWait = await searchQueue();
    expect(byWait.success && byWait.data.items.map((i) => i.title)).toEqual(["Antigo", "Urgente"]);
    const byPriority = await searchQueue({ sort: "priority" });
    expect(byPriority.success && byPriority.data.items.map((i) => i.title)).toEqual(["Urgente", "Antigo"]);
    const filtered = await searchQueue({ priority: ProjectPriority.URGENT, q: "urg" });
    expect(filtered.success && filtered.data.total).toBe(1);

    // summary numbers ignore filters
    const stats = await queueStats();
    expect(stats.success && stats.data).toEqual({ total: 2, high: 1, urgent: 1 });
  });
});

describe("log search", () => {
  it("filters by text, day and visibility, keeping each role's scope", async () => {
    const { coord, dev1, requester, project } = await setup();
    const other = await makeProject(requester.id, { title: "Outro projeto" });
    await assignToProject(project.id, dev1.id);
    const log = (projectId: string, message: string, isInternal: boolean, createdAt: string) =>
      prisma.projectLog.create({ data: { projectId, message, isInternal, authorName: "Fulano", createdAt: new Date(createdAt) } });
    await log(project.id, "Status atualizado", true, "2026-10-05T15:00:00Z");
    await log(project.id, "Resposta ao solicitante", false, "2026-10-06T15:00:00Z");
    await log(other.id, "Nota interna do outro", true, "2026-10-07T15:00:00Z");

    actAs(coord);
    const messages = async (p: Parameters<typeof searchProjectLogs>[0]) => {
      const r = await searchProjectLogs(p);
      return r.success ? r.data.items.map((i) => i.message).sort() : [];
    };
    expect(await messages({})).toHaveLength(3);
    expect(await messages({ q: "outro" })).toEqual(["Nota interna do outro"]);
    expect(await messages({ visibility: "public" })).toEqual(["Resposta ao solicitante"]);
    expect(await messages({ visibility: "internal" })).toHaveLength(2);
    expect(await messages({ from: "2026-10-06", to: "2026-10-06" })).toEqual(["Resposta ao solicitante"]);
    expect(await messages({ from: "2026-10-06" })).toHaveLength(2);

    // 21:00 in São Paulo on Oct 7th is already Oct 8th in UTC: still Oct 7th for the user
    await log(project.id, "Noite", false, "2026-10-08T00:30:00Z");
    expect(await messages({ from: "2026-10-07", to: "2026-10-07" })).toEqual(["Nota interna do outro", "Noite"].sort());

    actAs(dev1); // only the project they belong to
    expect(await messages({ q: "outro" })).toEqual([]);
    expect(await messages({})).toContain("Status atualizado");

    actAs(requester); // only public messages of their own projects
    const own = await messages({});
    expect(own).not.toContain("Status atualizado");
    expect(own).toContain("Resposta ao solicitante");
  });
});
