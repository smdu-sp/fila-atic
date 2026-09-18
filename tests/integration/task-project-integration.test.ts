import { beforeEach, describe, expect, it } from "vitest";
import { ProjectStatus, Role, TaskStatus } from "@prisma/client";

import {
  createProject,
  listProjects,
  removeDeveloper,
  updateProject,
} from "@/actions/projectActions";
import { updateProjectStatusRestricted } from "@/actions/solicitacaoActions";
import {
  createTask,
  deleteTask,
  listMyTasks,
  listTasksByProject,
  updateTask,
} from "@/actions/taskActions";
import { summarizeTasks } from "@/lib/taskStatus";
import {
  actAs,
  assignToProject,
  makeProject,
  makeTask,
  makeUser,
  prisma,
  resetDb,
} from "../helpers";

beforeEach(resetDb);

async function setup() {
  const coord = await makeUser(Role.COORDINATOR);
  const dev2 = await makeUser(Role.DEV_GLOBAL);
  const dev1 = await makeUser(Role.DEV_RESTRICTED);
  const requester = await makeUser(Role.REQUESTER);
  const project = await makeProject(requester.id, {
    status: ProjectStatus.IN_DEVELOPMENT,
  });
  return { coord, dev2, dev1, requester, project };
}

const statusHistory = (projectId: string) =>
  prisma.projectStatusChange.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });

describe("task progress", () => {
  it("ignores cancelled tasks and counts done and deployed as delivered", () => {
    const s = summarizeTasks([
      TaskStatus.TODO,
      TaskStatus.DONE,
      TaskStatus.DEPLOYED,
      TaskStatus.CANCELED,
      TaskStatus.IN_PROGRESS,
    ]);
    expect(s).toEqual({ total: 4, done: 2, open: 2, canceled: 1, percent: 50 });
    expect(summarizeTasks([])).toMatchObject({ total: 0, percent: 0 });
    expect(summarizeTasks([TaskStatus.CANCELED])).toMatchObject({ total: 0, percent: 0 });
  });
});

describe("status history", () => {
  it("starts when the project is created and follows every change", async () => {
    const { requester, coord } = await setup();
    actAs(requester);
    await createProject({ title: "Novo", description: "d", justification: "j" });
    const project = await prisma.project.findFirstOrThrow({ where: { title: "Novo" } });

    actAs(coord);
    await updateProject({ id: project.id, status: ProjectStatus.IN_ANALYSIS });
    await updateProject({ id: project.id, status: ProjectStatus.IN_ANALYSIS }); // no change
    await updateProject({ id: project.id, priority: "HIGH" }); // not a status change
    await updateProject({ id: project.id, status: ProjectStatus.IN_DEVELOPMENT });

    const history = await statusHistory(project.id);
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, ProjectStatus.IN_QUEUE],
      [ProjectStatus.IN_QUEUE, ProjectStatus.IN_ANALYSIS],
      [ProjectStatus.IN_ANALYSIS, ProjectStatus.IN_DEVELOPMENT],
    ]);
    expect(history[1].changedByName).toBe(coord.name);
  });

  it("is also written by the restricted developer action", async () => {
    const { dev1, project } = await setup();
    await assignToProject(project.id, dev1.id);
    actAs(dev1);

    await updateProjectStatusRestricted(project.id, ProjectStatus.IN_TESTING);
    expect((await statusHistory(project.id)).map((h) => h.toStatus)).toEqual([ProjectStatus.IN_TESTING]);
  });

  it("rejects an invalid status", async () => {
    const { coord, project } = await setup();
    actAs(coord);
    expect(await updateProject({ id: project.id, status: "NOPE" as ProjectStatus })).toMatchObject({ success: false });
  });
});

describe("finishing or cancelling a project with open tasks", () => {
  it("asks for confirmation before finishing, listing the open tasks", async () => {
    const { coord, project } = await setup();
    await makeTask(project.id, { title: "Aberta 1" });
    await makeTask(project.id, { title: "Aberta 2", status: TaskStatus.IN_PROGRESS });
    await makeTask(project.id, { title: "Pronta", status: TaskStatus.DONE });
    actAs(coord);

    const result = await updateProject({ id: project.id, status: ProjectStatus.FINISHED });
    expect(result).toMatchObject({ success: false });
    expect(!result.success && result.openTasks?.map((t) => t.title)).toEqual(["Aberta 1", "Aberta 2"]);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).status).toBe(ProjectStatus.IN_DEVELOPMENT);

    // closeOpenTasks is only for cancelling: it does not skip the warning here
    expect(await updateProject({ id: project.id, status: ProjectStatus.FINISHED, closeOpenTasks: true })).toMatchObject({ success: false });

    expect(await updateProject({ id: project.id, status: ProjectStatus.FINISHED, confirmOpenTasks: true })).toMatchObject({ success: true });
    // tasks are left alone
    expect(await prisma.task.count({ where: { status: TaskStatus.CANCELED } })).toBe(0);
  });

  it("finishes without asking when nothing is open", async () => {
    const { coord, project } = await setup();
    await makeTask(project.id, { status: TaskStatus.DONE });
    await makeTask(project.id, { status: TaskStatus.DEPLOYED });
    await makeTask(project.id, { status: TaskStatus.CANCELED });
    actAs(coord);

    expect(await updateProject({ id: project.id, status: ProjectStatus.FINISHED })).toMatchObject({ success: true });
  });

  it("offers to cancel the open tasks together with the project", async () => {
    const { coord, project } = await setup();
    const open = await makeTask(project.id, { title: "Aberta" });
    const done = await makeTask(project.id, { title: "Feita", status: TaskStatus.DONE });
    actAs(coord);

    const reason = "Escopo mudou, nao vamos mais fazer";
    expect(await updateProject({ id: project.id, status: ProjectStatus.CANCELED, closeReason: reason })).toMatchObject({ success: false });

    expect(await updateProject({ id: project.id, status: ProjectStatus.CANCELED, closeReason: reason, closeOpenTasks: true })).toMatchObject({ success: true });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: open.id } })).status).toBe(TaskStatus.CANCELED);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: done.id } })).status).toBe(TaskStatus.DONE);
    const logs = await prisma.projectLog.findMany({ where: { projectId: project.id } });
    expect(logs.some((l) => l.message.includes("canceladas junto com o projeto") || l.message.includes("cancelada junto com o projeto"))).toBe(true);
  });

  it("can cancel and keep the tasks when told so", async () => {
    const { coord, project } = await setup();
    const open = await makeTask(project.id);
    actAs(coord);

    expect(await updateProject({ id: project.id, status: ProjectStatus.CANCELED, closeReason: "Cancelado a pedido da area", confirmOpenTasks: true })).toMatchObject({ success: true });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: open.id } })).status).toBe(TaskStatus.TODO);
  });

  it("applies the same rule to restricted developers", async () => {
    const { dev1, project } = await setup();
    await assignToProject(project.id, dev1.id);
    await makeTask(project.id);
    actAs(dev1);

    expect(await updateProjectStatusRestricted(project.id, ProjectStatus.FINISHED)).toMatchObject({ success: false });
    expect(await updateProjectStatusRestricted(project.id, ProjectStatus.FINISHED, { confirmOpenTasks: true })).toMatchObject({ success: true });
  });
});

describe("assignee and project team", () => {
  it("adds a developer to the team when they receive a task", async () => {
    const { coord, dev1, project } = await setup();
    actAs(coord);

    const created = await createTask({ projectId: project.id, title: "Para o dev", assigneeId: dev1.id });
    expect(created.success).toBe(true);

    expect(await prisma.projectDeveloper.count({ where: { projectId: project.id, userId: dev1.id } })).toBe(1);
    const logs = await prisma.projectLog.findMany({ where: { projectId: project.id } });
    expect(logs.some((l) => l.message.includes("adicionado(a) a equipe"))).toBe(true);

    // so the restricted developer can see the project and the task
    actAs(dev1);
    const tasks = await listTasksByProject(project.id);
    expect(tasks.success && tasks.data).toHaveLength(1);
  });

  it("also adds the person when a task is reassigned, but never coordinators", async () => {
    const { coord, dev2, project } = await setup();
    const task = await makeTask(project.id);
    actAs(coord);

    await updateTask({ id: task.id, assigneeId: dev2.id });
    expect(await prisma.projectDeveloper.count({ where: { projectId: project.id, userId: dev2.id } })).toBe(1);

    await updateTask({ id: task.id, assigneeId: coord.id });
    expect(await prisma.projectDeveloper.count({ where: { projectId: project.id, userId: coord.id } })).toBe(0);
  });

  it("does not add the same person twice", async () => {
    const { coord, dev1, project } = await setup();
    await assignToProject(project.id, dev1.id);
    actAs(coord);

    await createTask({ projectId: project.id, title: "A", assigneeId: dev1.id });
    await createTask({ projectId: project.id, title: "B", assigneeId: dev1.id });
    expect(await prisma.projectDeveloper.count({ where: { projectId: project.id } })).toBe(1);
  });

  it("does not let a restricted developer put other people on the team", async () => {
    const { dev1, dev2, project } = await setup();
    await assignToProject(project.id, dev1.id);
    const mine = await makeTask(project.id, { assigneeId: dev1.id });
    actAs(dev1);

    expect(await createTask({ projectId: project.id, title: "X", assigneeId: dev2.id })).toMatchObject({ success: false });
    expect(await updateTask({ id: mine.id, assigneeId: dev2.id })).toMatchObject({ success: false });
    expect(await prisma.projectDeveloper.count({ where: { userId: dev2.id } })).toBe(0);

    // keeping a task or dropping it is fine
    expect(await createTask({ projectId: project.id, title: "Minha", assigneeId: dev1.id })).toMatchObject({ success: true });
    expect(await updateTask({ id: mine.id, assigneeId: null })).toMatchObject({ success: true });
  });

  it("asks what to do with open tasks when a developer leaves the team", async () => {
    const { coord, dev1, project } = await setup();
    await assignToProject(project.id, dev1.id);
    const open = await makeTask(project.id, { assigneeId: dev1.id });
    const done = await makeTask(project.id, { assigneeId: dev1.id, status: TaskStatus.DONE });
    actAs(coord);

    const refused = await removeDeveloper({ projectId: project.id, userId: dev1.id });
    expect(refused).toMatchObject({ success: false });
    expect(!refused.success && refused.openTasks?.map((t) => t.id)).toEqual([open.id]);
    expect(await prisma.projectDeveloper.count({ where: { userId: dev1.id } })).toBe(1);

    expect(await removeDeveloper({ projectId: project.id, userId: dev1.id, unassignTasks: true })).toMatchObject({ success: true });
    expect(await prisma.projectDeveloper.count({ where: { userId: dev1.id } })).toBe(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: open.id } })).assigneeId).toBeNull();
    // finished work keeps its author
    expect((await prisma.task.findUniqueOrThrow({ where: { id: done.id } })).assigneeId).toBe(dev1.id);
  });

  it("removes a developer without open tasks straight away", async () => {
    const { coord, dev1, project } = await setup();
    await assignToProject(project.id, dev1.id);
    actAs(coord);
    expect(await removeDeveloper({ projectId: project.id, userId: dev1.id })).toMatchObject({ success: true });
  });
});

describe("project list", () => {
  it("reports task progress and the team, hiding the team from requesters", async () => {
    const { coord, requester, dev1, project } = await setup();
    await assignToProject(project.id, dev1.id);
    await makeTask(project.id, { status: TaskStatus.DONE });
    await makeTask(project.id, { status: TaskStatus.TODO });
    await makeTask(project.id, { status: TaskStatus.CANCELED });
    const empty = await makeProject(requester.id, { title: "Sem tarefas" });

    actAs(coord);
    const staff = await listProjects();
    const row = staff.success && staff.data.find((p) => p.id === project.id);
    expect(row).toMatchObject({ taskTotal: 2, taskDone: 1, developerIds: [dev1.id] });
    expect(staff.success && staff.data.find((p) => p.id === empty.id)).toMatchObject({ taskTotal: 0, taskDone: 0 });

    actAs(requester);
    const own = await listProjects();
    expect(own.success && own.data.find((p) => p.id === project.id)).toMatchObject({ taskTotal: 2, developerIds: [] });
  });
});

describe("my tasks", () => {
  it("lists tasks assigned to me across projects", async () => {
    const { dev2, requester, project } = await setup();
    const other = await makeProject(requester.id, { title: "Outro" });
    await makeTask(project.id, { title: "Minha 1", assigneeId: dev2.id });
    await makeTask(other.id, { title: "Minha 2", assigneeId: dev2.id });
    await makeTask(other.id, { title: "De ninguem" });
    actAs(dev2);

    const result = await listMyTasks();
    expect(result.success && result.data.map((t) => t.title).sort()).toEqual(["Minha 1", "Minha 2"]);
    expect(result.success && result.data.find((t) => t.title === "Minha 2")?.projectTitle).toBe("Outro");
  });

  it("does not show a restricted developer tasks of projects they are not part of", async () => {
    const { dev1, project } = await setup();
    await makeTask(project.id, { title: "Orfa", assigneeId: dev1.id }); // legacy data: not on the team
    actAs(dev1);

    const result = await listMyTasks();
    expect(result.success && result.data).toHaveLength(0);
  });

  it("is not available to requesters", async () => {
    const { requester } = await setup();
    actAs(requester);
    expect(await listMyTasks()).toMatchObject({ success: false });
  });
});

describe("task activity is project activity", () => {
  it("logs title, description and assignee changes, not only status", async () => {
    const { coord, dev2, project } = await setup();
    const task = await prisma.task.create({ data: { projectId: project.id, title: "Antigo", description: "a" } });
    actAs(coord);

    await updateTask({ id: task.id, title: "Novo", description: "b", assigneeId: dev2.id, status: TaskStatus.IN_PROGRESS });

    const log = await prisma.projectLog.findFirstOrThrow({
      where: { projectId: project.id, message: { contains: "atualizada" } },
    });
    expect(log.message).toContain('Titulo: "Antigo" -> "Novo"');
    expect(log.message).toContain("Descricao alterada");
    expect(log.message).toContain("A fazer -> Em andamento");
    expect(log.message).toContain(`sem responsavel -> ${dev2.name}`);
  });

  it("writes no log when nothing changed", async () => {
    const { coord, project } = await setup();
    const task = await makeTask(project.id, { title: "Igual" });
    actAs(coord);

    await updateTask({ id: task.id, title: "Igual", status: TaskStatus.TODO });
    expect(await prisma.projectLog.count({ where: { projectId: project.id } })).toBe(0);
  });

  it("moves the project's last update forward", async () => {
    const { coord, project } = await setup();
    const old = new Date("2020-01-01T00:00:00Z");
    await prisma.$executeRaw`update "Project" set "updatedAt" = ${old} where id = ${project.id}`;
    actAs(coord);

    const created = await createTask({ projectId: project.id, title: "Nova" });
    const after = (await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).updatedAt;
    expect(after.getTime()).toBeGreaterThan(old.getTime());

    await prisma.$executeRaw`update "Project" set "updatedAt" = ${old} where id = ${project.id}`;
    if (created.success) await deleteTask(created.data);
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });
});
