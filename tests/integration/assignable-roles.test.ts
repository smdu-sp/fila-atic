import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";

import { assignDeveloper } from "@/actions/projectActions";
import { listAssignableDevelopers } from "@/actions/solicitacaoActions";
import { createTask, updateTask } from "@/actions/taskActions";
import { ASSIGNABLE_ROLES, isAssignableRole } from "@/lib/roles";
import { actAs, makeProject, makeTask, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

describe("who can be assigned", () => {
  it("is DEV I, DEV II and the tech lead", () => {
    expect([...ASSIGNABLE_ROLES].sort()).toEqual(
      [Role.DEV_RESTRICTED, Role.DEV_GLOBAL, Role.TECH_LEAD].sort(),
    );
    for (const role of [Role.COORDINATOR, Role.REQUESTER]) {
      expect(isAssignableRole(role)).toBe(false);
    }
    expect(isAssignableRole(null)).toBe(false);
  });

  it("all three show up in the assignee list, coordinators and requesters do not", async () => {
    const coord = await makeUser(Role.COORDINATOR, { name: "Coord" });
    const lead = await makeUser(Role.TECH_LEAD, { name: "Lead" });
    const dev1 = await makeUser(Role.DEV_RESTRICTED, { name: "Dev1" });
    const dev2 = await makeUser(Role.DEV_GLOBAL, { name: "Dev2" });
    await makeUser(Role.REQUESTER, { name: "Solicitante" });
    await makeUser(Role.TECH_LEAD, { name: "Inativo", isActive: false });

    actAs(coord);
    const result = await listAssignableDevelopers();
    expect(result.success && result.data.map((u) => u.name)).toEqual(["Dev1", "Dev2", "Lead"]);
    expect(result.success && result.data.find((u) => u.id === lead.id)?.role).toBe(Role.TECH_LEAD);
    expect([dev1.id, dev2.id].every((id) => result.success && result.data.some((u) => u.id === id))).toBe(true);
  });
});

describe("on a project", () => {
  it("the tech lead, DEV I and DEV II join the team; the coordinator and requesters cannot", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);
    actAs(coord);

    for (const role of [Role.TECH_LEAD, Role.DEV_RESTRICTED, Role.DEV_GLOBAL]) {
      const person = await makeUser(role);
      expect(await assignDeveloper({ projectId: project.id, userId: person.id })).toMatchObject({ success: true });
    }
    expect(await prisma.projectDeveloper.count({ where: { projectId: project.id } })).toBe(3);

    const otherCoord = await makeUser(Role.COORDINATOR);
    expect(await assignDeveloper({ projectId: project.id, userId: otherCoord.id })).toMatchObject({ success: false });
    expect(await assignDeveloper({ projectId: project.id, userId: requester.id })).toMatchObject({ success: false });
  });
});

describe("on a task", () => {
  it("can be created or reassigned to the tech lead, who then joins the project team", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const lead = await makeUser(Role.TECH_LEAD);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);
    actAs(coord);

    const created = await createTask({ projectId: project.id, title: "Revisar", assigneeId: lead.id });
    if (!created.success) throw new Error(created.error);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: created.data } })).assigneeId).toBe(lead.id);
    expect(await prisma.projectDeveloper.count({ where: { projectId: project.id, userId: lead.id } })).toBe(1);

    const other = await makeTask(project.id);
    expect(await updateTask({ id: other.id, assigneeId: lead.id })).toMatchObject({ success: true });
  });

  it("cannot be given to a coordinator or a requester", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const other = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);
    const task = await makeTask(project.id);
    actAs(coord);

    for (const person of [other, requester]) {
      expect(await createTask({ projectId: project.id, title: "X", assigneeId: person.id })).toMatchObject({ success: false });
      expect(await updateTask({ id: task.id, assigneeId: person.id })).toMatchObject({ success: false });
    }
  });
});
