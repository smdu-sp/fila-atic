import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectCategory, ProjectPriority, ProjectStatus, Role, TaskStatus } from "@prisma/client";

import { deleteProject, searchProjects, updateProject } from "@/actions/projectActions";
import { searchQueue } from "@/actions/queueActions";
import { getProjectDetails } from "@/actions/solicitacaoActions";
import {
  addTaskAttachments,
  addTaskComment,
  deleteTaskAttachment,
  deleteTaskComment,
  getTaskDetails,
} from "@/actions/taskDetailActions";
import {
  createTask,
  deleteTask,
  listMyTasks,
  listTasksByProject,
  moveTask,
  updateTask,
} from "@/actions/taskActions";
import { GET as downloadUpload } from "@/app/uploads/[name]/route";
import { deleteUploads } from "@/lib/uploads";
import {
  actAs,
  assignToProject,
  makeProject,
  makeTask,
  makeUser,
  prisma,
  resetDb,
} from "../helpers";

// Uploads never touch the disk; downloads answer 200 so the tests can check
// who is allowed to get a file, not whether the fake file exists.
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
    serveUpload: vi.fn(async () => new Response("ok", { status: 200 })),
  };
});

beforeEach(async () => {
  await resetDb();
  vi.mocked(deleteUploads).mockClear();
});

async function setup() {
  const coord = await makeUser(Role.COORDINATOR);
  const dev2 = await makeUser(Role.DEV_GLOBAL);
  const dev1 = await makeUser(Role.DEV_RESTRICTED);
  const stranger = await makeUser(Role.DEV_RESTRICTED);
  const requester = await makeUser(Role.REQUESTER);
  const project = await makeProject(requester.id, { status: ProjectStatus.IN_DEVELOPMENT });
  await assignToProject(project.id, dev1.id);
  return { coord, dev2, dev1, stranger, requester, project };
}

const order = async (projectId: string, status: TaskStatus) => {
  const result = await listTasksByProject(projectId);
  return result.success ? result.data.filter((t) => t.status === status).map((t) => t.title) : [];
};

const notificationsOf = (userId: string) => prisma.notification.findMany({ where: { userId } });

const registerLabels = (...names: string[]) =>
  prisma.label.createMany({ data: names.map((name) => ({ name, color: "#3b82f6" })) });

describe("priority and labels", () => {
  it("default to medium and none, and are set at creation", async () => {
    const { coord, project } = await setup();
    await registerLabels("api", "banco de dados");
    actAs(coord);

    const plain = await createTask({ projectId: project.id, title: "Simples" });
    const rich = await createTask({ projectId: project.id, title: "Completa", priority: ProjectPriority.URGENT, labels: ["  API ", "api", "banco de dados"] });
    if (!plain.success || !rich.success) throw new Error("create failed");

    expect(await prisma.task.findUniqueOrThrow({ where: { id: plain.data } })).toMatchObject({ priority: ProjectPriority.MEDIUM, labels: [] });
    expect(await prisma.task.findUniqueOrThrow({ where: { id: rich.data } })).toMatchObject({ priority: ProjectPriority.URGENT, labels: ["api", "banco de dados"] });
  });

  it("are validated", async () => {
    const { coord, project } = await setup();
    const task = await makeTask(project.id);
    actAs(coord);

    expect(await createTask({ projectId: project.id, title: "X", priority: "MAX" as ProjectPriority })).toMatchObject({ success: false });
    expect(await createTask({ projectId: project.id, title: "X", labels: Array.from({ length: 9 }, (_, i) => `l${i}`) })).toMatchObject({ success: false });
    expect(await updateTask({ id: task.id, priority: "MAX" as ProjectPriority })).toMatchObject({ success: false });
    expect(await updateTask({ id: task.id, labels: ["x".repeat(31)] })).toMatchObject({ success: false });
  });

  it("changes are logged, and an unchanged update logs nothing", async () => {
    const { coord, project } = await setup();
    const task = await makeTask(project.id, { title: "Tarefa" });
    await registerLabels("api", "urgente");
    actAs(coord);

    await updateTask({ id: task.id, priority: ProjectPriority.HIGH, labels: ["api", "urgente"] });
    const log = await prisma.projectLog.findFirstOrThrow({ where: { projectId: project.id } });
    expect(log.message).toContain("Prioridade: Media -> Alta");
    expect(log.message).toContain("Etiquetas: nenhuma -> api, urgente");

    await prisma.projectLog.deleteMany();
    await updateTask({ id: task.id, priority: ProjectPriority.HIGH, labels: [" api ", "urgente", "URGENTE"] });
    expect(await prisma.projectLog.count()).toBe(0);
  });

  it("come back in the lists with the comment and attachment counters", async () => {
    const { coord, dev2, project } = await setup();
    const task = await prisma.task.create({ data: { projectId: project.id, title: "T", assigneeId: dev2.id, priority: ProjectPriority.LOW, labels: ["a"] } });
    await prisma.taskComment.create({ data: { taskId: task.id, authorId: coord.id, authorName: "x", message: "oi" } });
    await prisma.taskAttachment.create({ data: { taskId: task.id, fileName: "a.pdf", fileUrl: "/uploads/a.pdf", fileSize: 1, uploadedById: coord.id, uploadedByName: "x" } });

    actAs(coord);
    const byProject = await listTasksByProject(project.id);
    expect(byProject.success && byProject.data[0]).toMatchObject({ priority: ProjectPriority.LOW, labels: ["a"], commentCount: 1, attachmentCount: 1 });

    actAs(dev2);
    const mine = await listMyTasks();
    expect(mine.success && mine.data[0]).toMatchObject({ commentCount: 1, attachmentCount: 1, labels: ["a"] });
  });
});

describe("ordering inside a column", () => {
  it("puts new tasks on top", async () => {
    const { coord, project } = await setup();
    actAs(coord);
    await createTask({ projectId: project.id, title: "Primeira" });
    await new Promise((r) => setTimeout(r, 15));
    await createTask({ projectId: project.id, title: "Segunda" });
    await new Promise((r) => setTimeout(r, 15));
    await createTask({ projectId: project.id, title: "Terceira" });

    expect(await order(project.id, TaskStatus.TODO)).toEqual(["Terceira", "Segunda", "Primeira"]);
  });

  async function column(titles: string[]) {
    const { coord, dev1, project } = await setup();
    const tasks = [];
    for (const [i, title] of titles.entries()) tasks.push(await prisma.task.create({ data: { projectId: project.id, title, position: i } }));
    return { coord, dev1, project, tasks: Object.fromEntries(tasks.map((t) => [t.title, t])) };
  }

  it("moves a card in front of another, to the top and to the end", async () => {
    const { coord, project, tasks } = await column(["A", "B", "C", "D"]);
    actAs(coord);

    await moveTask({ taskId: tasks.D.id, status: TaskStatus.TODO, beforeTaskId: tasks.B.id });
    expect(await order(project.id, TaskStatus.TODO)).toEqual(["A", "D", "B", "C"]);

    await moveTask({ taskId: tasks.C.id, status: TaskStatus.TODO, beforeTaskId: tasks.A.id });
    expect(await order(project.id, TaskStatus.TODO)).toEqual(["C", "A", "D", "B"]);

    await moveTask({ taskId: tasks.C.id, status: TaskStatus.TODO, beforeTaskId: null });
    expect(await order(project.id, TaskStatus.TODO)).toEqual(["A", "D", "B", "C"]);
  });

  it("moves across columns, logging the status change, at the chosen place", async () => {
    const { coord, project, tasks } = await column(["A", "B"]);
    const doing = await prisma.task.create({ data: { projectId: project.id, title: "X", status: TaskStatus.IN_PROGRESS, position: 0 } });
    const doing2 = await prisma.task.create({ data: { projectId: project.id, title: "Y", status: TaskStatus.IN_PROGRESS, position: 1 } });
    actAs(coord);

    await moveTask({ taskId: tasks.A.id, status: TaskStatus.IN_PROGRESS, beforeTaskId: doing2.id });
    expect(await order(project.id, TaskStatus.IN_PROGRESS)).toEqual(["X", "A", "Y"]);
    expect(await order(project.id, TaskStatus.TODO)).toEqual(["B"]);
    const log = await prisma.projectLog.findFirstOrThrow({ where: { projectId: project.id } });
    expect(log.message).toContain("A fazer -> Em andamento");
    void doing;
  });

  it("without a place, only the column changes and the order is kept", async () => {
    const { coord, project, tasks } = await column(["A", "B"]);
    actAs(coord);
    await moveTask({ taskId: tasks.A.id, status: TaskStatus.DONE });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: tasks.A.id } })).position).toBe(0);
    expect(await order(project.id, TaskStatus.DONE)).toEqual(["A"]);
  });

  it("keeps the order after the gap between two cards runs out", async () => {
    const { coord, project, tasks } = await column(["A", "B"]);
    await prisma.task.update({ where: { id: tasks.A.id }, data: { position: 0 } });
    await prisma.task.update({ where: { id: tasks.B.id }, data: { position: 1e-9 } });
    const c = await prisma.task.create({ data: { projectId: project.id, title: "C", position: 5 } });
    actAs(coord);

    await moveTask({ taskId: c.id, status: TaskStatus.TODO, beforeTaskId: tasks.B.id });

    expect(await order(project.id, TaskStatus.TODO)).toEqual(["A", "C", "B"]);
    const positions = (await prisma.task.findMany({ where: { projectId: project.id }, orderBy: { position: "asc" } })).map((t) => t.position);
    expect(new Set(positions).size).toBe(3);
    expect(positions[1] - positions[0]).toBeGreaterThan(0.5);
  });

  it("many moves in the same spot never lose the order", async () => {
    const { coord, project, tasks } = await column(["A", "B", "C"]);
    const extra = [];
    for (let i = 0; i < 25; i++) extra.push(await prisma.task.create({ data: { projectId: project.id, title: `M${i}`, position: 10 + i } }));
    actAs(coord);

    // always squeeze the next card between A and B
    for (const t of extra) await moveTask({ taskId: t.id, status: TaskStatus.TODO, beforeTaskId: tasks.B.id });

    const titles = await order(project.id, TaskStatus.TODO);
    expect(titles.slice(0, 1)).toEqual(["A"]);
    expect(titles.indexOf("B")).toBe(26);
    expect(titles.slice(1, 26)).toEqual(extra.map((t) => t.title)); // insertion order preserved
  });

  it("validates the target and the permissions", async () => {
    const { coord, dev1, project, tasks } = await column(["A", "B"]);
    await prisma.task.update({ where: { id: tasks.A.id }, data: { assigneeId: dev1.id } });

    actAs(coord);
    expect(await moveTask({ taskId: tasks.A.id, status: "NOPE" as TaskStatus })).toMatchObject({ success: false });
    expect(await moveTask({ taskId: tasks.A.id, status: TaskStatus.TODO, beforeTaskId: "nao-existe" })).toMatchObject({ success: false });

    actAs(dev1); // own task only
    expect(await moveTask({ taskId: tasks.A.id, status: TaskStatus.IN_PROGRESS })).toMatchObject({ success: true });
    expect(await moveTask({ taskId: tasks.B.id, status: TaskStatus.IN_PROGRESS })).toMatchObject({ success: false });
    void project;
  });
});

describe("comments", () => {
  it("can be written by staff with access, and read back in order", async () => {
    const { coord, dev1, project } = await setup();
    const task = await makeTask(project.id, { assigneeId: dev1.id });

    actAs(coord);
    expect(await addTaskComment({ taskId: task.id, message: "  Primeiro comentario " })).toMatchObject({ success: true });
    actAs(dev1);
    expect(await addTaskComment({ taskId: task.id, message: "Resposta" })).toMatchObject({ success: true });

    const details = await getTaskDetails(task.id);
    expect(details.success && details.data.comments.map((c) => [c.authorName, c.message])).toEqual([[coord.name, "Primeiro comentario"], [dev1.name, "Resposta"]]);
  });

  it("are refused to requesters, people without access, and empty or huge texts", async () => {
    const { coord, stranger, requester, project } = await setup();
    const task = await makeTask(project.id);

    actAs(requester);
    expect(await addTaskComment({ taskId: task.id, message: "oi" })).toMatchObject({ success: false });
    expect(await getTaskDetails(task.id)).toMatchObject({ success: false });
    actAs(stranger);
    expect(await addTaskComment({ taskId: task.id, message: "oi" })).toMatchObject({ success: false });
    actAs(coord);
    expect(await addTaskComment({ taskId: task.id, message: "   " })).toMatchObject({ success: false });
    expect(await addTaskComment({ taskId: task.id, message: "x".repeat(4001) })).toMatchObject({ success: false });
    expect(await prisma.taskComment.count()).toBe(0);
  });

  it("notify the owner and earlier participants, never the author", async () => {
    const { coord, dev1, dev2, project } = await setup();
    const task = await makeTask(project.id, { title: "Login", assigneeId: dev1.id });

    actAs(coord);
    await addTaskComment({ taskId: task.id, message: "Precisamos disso ate sexta" });
    actAs(dev2);
    await addTaskComment({ taskId: task.id, message: "Posso ajudar" });

    // dev1 owns the task; coord took part; dev2 wrote the last one
    expect((await notificationsOf(dev1.id)).map((n) => n.title)).toEqual(['Novo comentário em "Login"', 'Novo comentário em "Login"']);
    expect(await notificationsOf(coord.id)).toHaveLength(1);
    expect(await notificationsOf(dev2.id)).toHaveLength(0);
    const first = (await notificationsOf(dev1.id)).find((n) => n.body?.includes("Precisamos"));
    expect(first).toMatchObject({ kind: "TASK_COMMENT", href: `/kanban?projeto=${project.id}` });
    expect(first?.body).toBe(`${coord.name}: Precisamos disso ate sexta`);
  });

  it("can be deleted by their author or by a manager, not by others", async () => {
    const { coord, dev1, project } = await setup();
    const dev1b = await makeUser(Role.DEV_RESTRICTED);
    await assignToProject(project.id, dev1b.id);
    const task = await makeTask(project.id);
    const mine = await prisma.taskComment.create({ data: { taskId: task.id, authorId: dev1.id, authorName: dev1.name, message: "meu" } });
    const theirs = await prisma.taskComment.create({ data: { taskId: task.id, authorId: dev1b.id, authorName: dev1b.name, message: "dele" } });

    actAs(dev1);
    expect(await deleteTaskComment(theirs.id)).toMatchObject({ success: false });
    expect(await deleteTaskComment(mine.id)).toMatchObject({ success: true });
    actAs(coord);
    expect(await deleteTaskComment(theirs.id)).toMatchObject({ success: true });
    expect(await prisma.taskComment.count()).toBe(0);
  });
});

describe("task attachments", () => {
  const file = (name: string, type = "application/pdf") => new File(["x"], name, { type });
  const form = (taskId: string, ...files: File[]) => {
    const data = new FormData();
    data.set("taskId", taskId);
    files.forEach((f) => data.append("attachments", f));
    return data;
  };

  it("are added by staff with access, listed and logged", async () => {
    const { dev1, project } = await setup();
    const task = await makeTask(project.id, { title: "Tela" });
    actAs(dev1);

    expect(await addTaskAttachments(form(task.id, file("layout.pdf"), file("print.png", "image/png")))).toMatchObject({ success: true });

    const details = await getTaskDetails(task.id);
    expect(details.success && details.data.attachments.map((a) => a.fileName).sort()).toEqual(["layout.pdf", "print.png"]);
    expect(details.success && details.data.attachments[0].uploadedByName).toBe(dev1.name);
    expect((await prisma.projectLog.findFirstOrThrow({ where: { projectId: project.id } })).message).toContain('Anexo(s) adicionado(s) a tarefa "Tela"');
  });

  it("are validated and refused to requesters and strangers", async () => {
    const { requester, stranger, coord, project } = await setup();
    const task = await makeTask(project.id);

    actAs(coord);
    expect(await addTaskAttachments(form(task.id))).toMatchObject({ success: false });
    expect(await addTaskAttachments(form(task.id, file("x.html", "text/html")))).toMatchObject({ success: false });
    actAs(requester);
    expect(await addTaskAttachments(form(task.id, file("a.pdf")))).toMatchObject({ success: false });
    actAs(stranger);
    expect(await addTaskAttachments(form(task.id, file("a.pdf")))).toMatchObject({ success: false });
    expect(await prisma.taskAttachment.count()).toBe(0);
  });

  it("are removed, with their file, by the uploader or a manager", async () => {
    const { coord, dev1, project } = await setup();
    const dev1b = await makeUser(Role.DEV_RESTRICTED);
    await assignToProject(project.id, dev1b.id);
    const task = await makeTask(project.id);
    actAs(dev1);
    await addTaskAttachments(form(task.id, file("meu.pdf")));
    const [attachment] = await prisma.taskAttachment.findMany();

    actAs(dev1b);
    expect(await deleteTaskAttachment(attachment.id)).toMatchObject({ success: false });
    actAs(coord);
    expect(await deleteTaskAttachment(attachment.id)).toMatchObject({ success: true });
    expect(vi.mocked(deleteUploads)).toHaveBeenCalledWith(["/uploads/fake-meu.pdf"]);
    expect(await prisma.taskAttachment.count()).toBe(0);
  });

  it("go away with the task and with the project", async () => {
    const { coord, project } = await setup();
    const task = await makeTask(project.id);
    const other = await makeTask(project.id);
    actAs(coord);
    await addTaskAttachments(form(task.id, file("a.pdf")));
    await addTaskAttachments(form(other.id, file("b.pdf")));
    vi.mocked(deleteUploads).mockClear();

    await deleteTask(task.id);
    expect(vi.mocked(deleteUploads)).toHaveBeenCalledWith(["/uploads/fake-a.pdf"]);

    vi.mocked(deleteUploads).mockClear();
    await deleteProject(project.id);
    expect(vi.mocked(deleteUploads).mock.calls.flat(2)).toContain("/uploads/fake-b.pdf");
  });

  it("can be downloaded by staff with access to the project, not by anyone else", async () => {
    const { coord, dev1, stranger, requester, project } = await setup();
    const task = await makeTask(project.id);
    actAs(coord);
    await addTaskAttachments(form(task.id, file("interno.pdf")));
    const get = () => downloadUpload(new Request("http://x/uploads/fake-interno.pdf"), { params: Promise.resolve({ name: "fake-interno.pdf" }) });

    actAs(coord);
    expect((await get()).status).toBe(200);
    actAs(dev1); // on the team
    expect((await get()).status).toBe(200);
    actAs(stranger);
    expect((await get()).status).toBe(404);
    actAs(requester); // task files are internal work
    expect((await get()).status).toBe(404);
    actAs(null);
    expect((await get()).status).toBe(401);
  });
});

describe("request category", () => {
  it("is set and cleared by managers, logged, and validated", async () => {
    const { coord, dev1, project } = await setup();

    actAs(coord);
    expect(await updateProject({ id: project.id, category: ProjectCategory.BUG })).toMatchObject({ success: true });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).category).toBe(ProjectCategory.BUG);
    await updateProject({ id: project.id, category: ProjectCategory.NEW_SYSTEM });
    await updateProject({ id: project.id, category: null });
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).category).toBeNull();

    const messages = (await prisma.projectLog.findMany({ where: { projectId: project.id } })).map((l) => l.message);
    expect(messages.some((m) => m.includes("Categoria: sem categoria -> Erro / correção"))).toBe(true);
    expect(messages.some((m) => m.includes("Categoria: Erro / correção -> Sistema novo"))).toBe(true);
    expect(messages.some((m) => m.includes("Categoria: Sistema novo -> sem categoria"))).toBe(true);

    expect(await updateProject({ id: project.id, category: "X" as ProjectCategory })).toMatchObject({ success: false });
    actAs(dev1);
    expect(await updateProject({ id: project.id, category: ProjectCategory.BUG })).toMatchObject({ success: false });
  });

  it("filters the project list and the queue, and shows in the details", async () => {
    const { coord, requester } = await setup();
    const a = await makeProject(requester.id, { title: "Erro no portal", status: ProjectStatus.IN_QUEUE });
    const b = await makeProject(requester.id, { title: "Sistema novo de protocolo", status: ProjectStatus.IN_QUEUE });
    await prisma.project.update({ where: { id: a.id }, data: { category: ProjectCategory.BUG } });
    await prisma.project.update({ where: { id: b.id }, data: { category: ProjectCategory.NEW_SYSTEM } });
    actAs(coord);

    const projects = await searchProjects({ category: ProjectCategory.BUG });
    expect(projects.success && projects.data.items.map((p) => p.title)).toEqual(["Erro no portal"]);
    expect(projects.success && projects.data.items[0].category).toBe(ProjectCategory.BUG);
    const queue = await searchQueue({ category: ProjectCategory.NEW_SYSTEM });
    expect(queue.success && queue.data.items.map((p) => p.title)).toEqual(["Sistema novo de protocolo"]);

    const details = await getProjectDetails(a.id);
    expect(details.success && details.data.category).toBe(ProjectCategory.BUG);
  });
});
