import { beforeEach, describe, expect, it } from "vitest";
import { ProjectStatus, Role, TaskStatus } from "@prisma/client";

import {
  assignDeveloper,
  createProject,
  deleteProject,
  listProjects,
  removeDeveloper,
  updateProject,
} from "@/actions/projectActions";
import {
  createProjectMessage,
  getProjectDetails,
  updateProjectStatusRestricted,
} from "@/actions/solicitacaoActions";
import {
  createTask,
  deleteTask,
  listTasksByProject,
  updateTask,
} from "@/actions/taskActions";
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

async function setup() {
  const coord = await makeUser(Role.COORDINATOR);
  const dev2 = await makeUser(Role.DEV_GLOBAL);
  const dev1 = await makeUser(Role.DEV_RESTRICTED);
  const requester = await makeUser(Role.REQUESTER);
  const other = await makeUser(Role.REQUESTER);
  const mine = await makeProject(requester.id, { title: "Meu projeto" });
  const theirs = await makeProject(other.id, { title: "Projeto de outro" });
  return { coord, dev2, dev1, requester, other, mine, theirs };
}

describe("visibility by role", () => {
  it("lists only what each role may see", async () => {
    const { coord, dev1, requester, mine, theirs } = await setup();
    await assignToProject(theirs.id, dev1.id);

    actAs(coord);
    const all = await listProjects();
    expect(all.success && all.data).toHaveLength(2);

    actAs(requester);
    const own = await listProjects();
    expect(own.success && own.data.map((p) => p.id)).toEqual([mine.id]);

    actAs(dev1);
    const assigned = await listProjects();
    expect(assigned.success && assigned.data.map((p) => p.id)).toEqual([theirs.id]);
  });

  it("hides project details from people without access", async () => {
    const { dev1, requester, other, mine } = await setup();

    actAs(other);
    expect(await getProjectDetails(mine.id)).toMatchObject({ success: false });
    actAs(dev1);
    expect(await getProjectDetails(mine.id)).toMatchObject({ success: false });

    actAs(requester);
    expect(await getProjectDetails(mine.id)).toMatchObject({ success: true });
    await assignToProject(mine.id, dev1.id);
    actAs(dev1);
    expect(await getProjectDetails(mine.id)).toMatchObject({ success: true });
  });
});

describe("projects", () => {
  it("lets a requester open a project, which starts in the queue", async () => {
    const { requester } = await setup();
    actAs(requester);

    const result = await createProject({
      title: "Novo sistema",
      description: "Descricao",
      justification: "Justificativa",
    });
    expect(result.success).toBe(true);
    const project = await prisma.project.findFirstOrThrow({ where: { title: "Novo sistema" } });
    expect(project.status).toBe(ProjectStatus.IN_QUEUE);
  });

  it("only coordinators delete projects, and the delete really works", async () => {
    const { coord, dev2, mine } = await setup();
    const task = await makeTask(mine.id);
    await prisma.projectLog.create({ data: { projectId: mine.id, message: "x", authorName: "y" } });

    actAs(dev2);
    expect(await deleteProject(mine.id)).toMatchObject({ success: false });

    actAs(coord);
    expect(await deleteProject(mine.id)).toMatchObject({ success: true });
    expect(await prisma.project.findUnique({ where: { id: mine.id } })).toBeNull();
    // tasks and logs go with it
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await prisma.projectLog.count({ where: { projectId: mine.id } })).toBe(0);
  });

  it("logs status changes with readable labels", async () => {
    const { coord, mine } = await setup();
    actAs(coord);

    await updateProject({ id: mine.id, status: ProjectStatus.IN_ANALYSIS });
    const log = await prisma.projectLog.findFirstOrThrow({ where: { projectId: mine.id } });
    expect(log.message).toContain("Na fila -> Em analise");
    expect(log.isInternal).toBe(true);
  });

  it("lets a restricted developer change status only on assigned projects", async () => {
    const { dev1, mine, theirs } = await setup();
    await assignToProject(mine.id, dev1.id);
    actAs(dev1);

    expect(await updateProjectStatusRestricted(mine.id, ProjectStatus.IN_DEVELOPMENT)).toMatchObject({ success: true });
    expect(await updateProjectStatusRestricted(theirs.id, ProjectStatus.IN_DEVELOPMENT)).toMatchObject({ success: false });
    expect(await updateProjectStatusRestricted(mine.id, "NOPE" as ProjectStatus)).toMatchObject({ success: false });
  });

  it("assigns only active developers and refuses to remove people who are not assigned", async () => {
    const { coord, dev1, requester, mine } = await setup();
    actAs(coord);

    expect(await assignDeveloper({ projectId: mine.id, userId: dev1.id })).toMatchObject({ success: true });
    expect(await assignDeveloper({ projectId: mine.id, userId: requester.id })).toMatchObject({ success: false });
    expect(await assignDeveloper({ projectId: "nao-existe", userId: dev1.id })).toMatchObject({ success: false });

    expect(await removeDeveloper({ projectId: mine.id, userId: dev1.id })).toMatchObject({ success: true });
    expect(await removeDeveloper({ projectId: mine.id, userId: dev1.id })).toMatchObject({ success: false });
    // the log names the person, not the id
    const logs = await prisma.projectLog.findMany({ where: { projectId: mine.id } });
    expect(logs.some((l) => l.message.includes(dev1.name))).toBe(true);
  });
});

describe("tasks", () => {
  it("are managed by staff, never by requesters", async () => {
    const { requester, coord, mine } = await setup();

    actAs(requester);
    expect(await createTask({ projectId: mine.id, title: "Tarefa" })).toMatchObject({ success: false });

    actAs(coord);
    expect(await createTask({ projectId: mine.id, title: "Tarefa" })).toMatchObject({ success: true });
  });

  it("lets a restricted developer touch only their own tasks on assigned projects", async () => {
    const { dev1, dev2, mine } = await setup();
    await assignToProject(mine.id, dev1.id);
    const own = await makeTask(mine.id, { assigneeId: dev1.id });
    const foreign = await makeTask(mine.id, { assigneeId: dev2.id });

    actAs(dev1);
    expect(await updateTask({ id: own.id, status: TaskStatus.IN_PROGRESS })).toMatchObject({ success: true });
    expect(await updateTask({ id: foreign.id, status: TaskStatus.IN_PROGRESS })).toMatchObject({ success: false });
    expect(await deleteTask(own.id)).toMatchObject({ success: false });
  });

  it("validates the assignee", async () => {
    const { coord, requester, mine } = await setup();
    const inactive = await makeUser(Role.DEV_GLOBAL, { isActive: false });
    actAs(coord);

    expect(await createTask({ projectId: mine.id, title: "A", assigneeId: requester.id })).toMatchObject({ success: false });
    expect(await createTask({ projectId: mine.id, title: "B", assigneeId: inactive.id })).toMatchObject({ success: false });
  });

  it("can clear the assignee and the description", async () => {
    const { coord, dev2, mine } = await setup();
    const task = await prisma.task.create({
      data: { projectId: mine.id, title: "T", description: "algo", assigneeId: dev2.id },
    });
    actAs(coord);

    expect(await updateTask({ id: task.id, assigneeId: null, description: null })).toMatchObject({ success: true });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      assigneeId: null,
      description: null,
    });
  });

  it("does not leak tasks of projects the user cannot access", async () => {
    const { dev1, mine } = await setup();
    await makeTask(mine.id);
    actAs(dev1);
    expect(await listTasksByProject(mine.id)).toMatchObject({ success: false });
  });

  it("logs creation, status change and removal on the project", async () => {
    const { coord, mine } = await setup();
    actAs(coord);

    const created = await createTask({ projectId: mine.id, title: "Fazer" });
    if (!created.success) throw new Error(created.error);
    await updateTask({ id: created.data, status: TaskStatus.DONE });
    await deleteTask(created.data);

    const messages = (await prisma.projectLog.findMany({ where: { projectId: mine.id } })).map((l) => l.message);
    expect(messages.some((m) => m.includes("criada"))).toBe(true);
    expect(messages.some((m) => m.includes("A fazer -> Concluido"))).toBe(true);
    expect(messages.some((m) => m.includes("removida"))).toBe(true);
  });
});

describe("guest notifications from staff actions", () => {
  it("e-mails a guest when staff answer or change the status, but not real accounts", async () => {
    const { coord, mine } = await setup();
    const guest = await makeUser(Role.REQUESTER, { email: "g@teste.gov.br", isGuest: true });
    const guestProject = await makeProject(guest.id, { trackingToken: "t".repeat(43) });
    actAs(coord);

    const form = new FormData();
    form.set("projectId", guestProject.id);
    form.set("message", "Resposta da equipe");
    await createProjectMessage(form);
    await updateProject({ id: guestProject.id, status: ProjectStatus.IN_ANALYSIS });

    const toGuest = mailsSent().filter((m) => m.to === "g@teste.gov.br");
    expect(toGuest).toHaveLength(2);
    expect(toGuest[0].text).toContain(`/acompanhar/${"t".repeat(43)}`);
    expect(toGuest[0].text).not.toContain("Resposta da equipe");

    // a regular requester gets nothing
    await updateProject({ id: mine.id, status: ProjectStatus.IN_ANALYSIS });
    expect(mailsSent()).toHaveLength(2);
  });
});
