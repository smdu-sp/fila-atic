import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";

import {
  createLabel,
  deleteLabel,
  listLabels,
  updateLabel,
} from "@/actions/labelActions";
import { createTask, updateTask } from "@/actions/taskActions";
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

const BLUE = "#3b82f6";

async function setup() {
  const coord = await makeUser(Role.COORDINATOR);
  const dev = await makeUser(Role.DEV_GLOBAL);
  const requester = await makeUser(Role.REQUESTER);
  const project = await makeProject(requester.id);
  await assignToProject(project.id, dev.id);
  return { coord, dev, requester, project };
}

const idOf = async (name: string) =>
  (await prisma.label.findFirstOrThrow({ where: { name } })).id;

describe("managing the palette", () => {
  it("lets coordination create labels and nobody else", async () => {
    const { coord, dev, requester } = await setup();

    for (const user of [dev, requester]) {
      actAs(user);
      expect(await createLabel({ name: "Urgente", color: BLUE })).toMatchObject({
        success: false,
        error: "Sem permissao",
      });
    }
    actAs(null);
    expect(await createLabel({ name: "Urgente", color: BLUE })).toMatchObject({ success: false });

    actAs(coord);
    expect(await createLabel({ name: "  Urgente ", color: "#EF4444" })).toMatchObject({ success: true });
    expect(await prisma.label.findMany()).toMatchObject([{ name: "Urgente", color: "#ef4444" }]);
  });

  it("works for the tech lead too", async () => {
    const lead = await makeUser(Role.TECH_LEAD);
    actAs(lead);

    expect(await createLabel({ name: "Infra", color: BLUE })).toMatchObject({ success: true });
  });

  it("rejects bad names, bad colors and names that only differ in case", async () => {
    const { coord } = await setup();
    actAs(coord);

    expect(await createLabel({ name: "  ", color: BLUE })).toMatchObject({ success: false });
    expect(await createLabel({ name: "x".repeat(31), color: BLUE })).toMatchObject({ success: false });
    expect(await createLabel({ name: "Ok", color: "azul" })).toMatchObject({ success: false });

    expect(await createLabel({ name: "Urgente", color: BLUE })).toMatchObject({ success: true });
    expect(await createLabel({ name: "URGENTE", color: BLUE })).toMatchObject({
      success: false,
      error: "Ja existe uma etiqueta com esse nome",
    });
    expect(await prisma.label.count()).toBe(1);
  });

  it("lists the palette alphabetically with how many tasks use each label", async () => {
    const { coord, dev, project } = await setup();
    await prisma.label.createMany({
      data: [
        { name: "banco", color: BLUE },
        { name: "Api", color: BLUE },
        { name: "Ágil", color: BLUE },
      ],
    });
    await prisma.task.create({ data: { projectId: project.id, title: "1", labels: ["Api", "banco"] } });
    await prisma.task.create({ data: { projectId: project.id, title: "2", labels: ["Api"] } });

    actAs(dev);
    const result = await listLabels();
    expect(result.success && result.data.map((l) => [l.name, l.taskCount])).toEqual([
      ["Ágil", 0],
      ["Api", 2],
      ["banco", 1],
    ]);

    actAs(coord);
    expect(await listLabels()).toMatchObject({ success: true });
  });

  it("does not list the palette to requesters or anonymous visitors", async () => {
    const { requester } = await setup();

    actAs(requester);
    expect(await listLabels()).toMatchObject({ success: false });
    actAs(null);
    expect(await listLabels()).toMatchObject({ success: false });
  });
});

describe("renaming, recoloring and deleting", () => {
  it("recoloring leaves the tasks alone", async () => {
    const { coord, project } = await setup();
    await prisma.label.create({ data: { name: "Api", color: BLUE } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: "T", labels: ["Api"] } });

    actAs(coord);
    expect(await updateLabel({ id: await idOf("Api"), color: "#22C55E" })).toMatchObject({ success: true });

    expect(await prisma.label.findFirstOrThrow()).toMatchObject({ name: "Api", color: "#22c55e" });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).labels).toEqual(["Api"]);
  });

  it("renaming carries every task along, keeping the order", async () => {
    const { coord, project } = await setup();
    await prisma.label.createMany({ data: [{ name: "Api", color: BLUE }, { name: "Banco", color: BLUE }] });
    const a = await prisma.task.create({ data: { projectId: project.id, title: "A", labels: ["Banco", "Api"] } });
    const b = await prisma.task.create({ data: { projectId: project.id, title: "B", labels: ["Banco"] } });
    const c = await prisma.task.create({ data: { projectId: project.id, title: "C", labels: ["Api"] } });

    actAs(coord);
    expect(await updateLabel({ id: await idOf("Banco"), name: "  Banco   de dados " })).toMatchObject({ success: true });

    const labelsOf = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).labels;
    expect(await labelsOf(a.id)).toEqual(["Banco de dados", "Api"]);
    expect(await labelsOf(b.id)).toEqual(["Banco de dados"]);
    expect(await labelsOf(c.id)).toEqual(["Api"]);
  });

  it("allows changing only the case, but not colliding with another label", async () => {
    const { coord } = await setup();
    await prisma.label.createMany({ data: [{ name: "api", color: BLUE }, { name: "Banco", color: BLUE }] });

    actAs(coord);
    expect(await updateLabel({ id: await idOf("api"), name: "API" })).toMatchObject({ success: true });
    expect(await updateLabel({ id: await idOf("Banco"), name: "api" })).toMatchObject({
      success: false,
      error: "Ja existe uma etiqueta com esse nome",
    });
  });

  it("validates the update and needs coordination", async () => {
    const { coord, dev } = await setup();
    const label = await prisma.label.create({ data: { name: "Api", color: BLUE } });

    actAs(dev);
    expect(await updateLabel({ id: label.id, name: "Outra" })).toMatchObject({ success: false, error: "Sem permissao" });
    expect(await deleteLabel(label.id)).toMatchObject({ success: false, error: "Sem permissao" });

    actAs(coord);
    expect(await updateLabel({ id: label.id, name: " " })).toMatchObject({ success: false });
    expect(await updateLabel({ id: label.id, color: "vermelho" })).toMatchObject({ success: false });
    expect(await updateLabel({ id: "nao-existe", name: "X" })).toMatchObject({ success: false });
    expect(await prisma.label.findUniqueOrThrow({ where: { id: label.id } })).toMatchObject({ name: "Api", color: BLUE });
  });

  it("deleting takes the label off every task and off the palette", async () => {
    const { coord, project } = await setup();
    await prisma.label.createMany({ data: [{ name: "Api", color: BLUE }, { name: "Banco", color: BLUE }] });
    const a = await prisma.task.create({ data: { projectId: project.id, title: "A", labels: ["Api", "Banco"] } });
    const b = await prisma.task.create({ data: { projectId: project.id, title: "B", labels: ["Api"] } });

    actAs(coord);
    expect(await deleteLabel(await idOf("Api"))).toMatchObject({ success: true });

    expect((await prisma.label.findMany()).map((l) => l.name)).toEqual(["Banco"]);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: a.id } })).labels).toEqual(["Banco"]);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: b.id } })).labels).toEqual([]);
    expect(await deleteLabel("nao-existe")).toMatchObject({ success: false });
  });
});

describe("tasks and the palette", () => {
  it("only accept registered labels, stored with the palette spelling", async () => {
    const { coord, project } = await setup();
    await prisma.label.createMany({ data: [{ name: "Urgente", color: BLUE }, { name: "API", color: BLUE }] });
    actAs(coord);

    const created = await createTask({ projectId: project.id, title: "T", labels: ["urgente", " api "] });
    if (!created.success) throw new Error("create failed");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: created.data } })).labels).toEqual(["Urgente", "API"]);

    const rejected = await createTask({ projectId: project.id, title: "T2", labels: ["Urgente", "inventada"] });
    expect(rejected).toMatchObject({ success: false });
    expect(!rejected.success && rejected.error).toContain("inventada");
    expect(await prisma.task.count()).toBe(1);
  });

  it("are rejected on update too, and the old labels stay", async () => {
    const { coord, project } = await setup();
    await prisma.label.create({ data: { name: "Urgente", color: BLUE } });
    const task = await prisma.task.create({ data: { projectId: project.id, title: "T", labels: ["Urgente"] } });
    actAs(coord);

    expect(await updateTask({ id: task.id, labels: ["Urgente", "inventada"] })).toMatchObject({ success: false });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).labels).toEqual(["Urgente"]);

    // no labels in the input: untouched, and clearing them is always allowed
    expect(await updateTask({ id: task.id, title: "Novo" })).toMatchObject({ success: true });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).labels).toEqual(["Urgente"]);
    expect(await updateTask({ id: task.id, labels: [] })).toMatchObject({ success: true });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).labels).toEqual([]);
  });

  it("a developer can pick from the palette on their own task", async () => {
    const { dev, project } = await setup();
    await prisma.label.create({ data: { name: "Urgente", color: BLUE } });
    const task = await makeTask(project.id, { assigneeId: dev.id });
    actAs(dev);

    expect(await updateTask({ id: task.id, labels: ["urgente"] })).toMatchObject({ success: true });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).labels).toEqual(["Urgente"]);
  });
});
