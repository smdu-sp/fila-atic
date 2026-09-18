import { beforeEach, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";

import { listDashboardCharts } from "@/actions/dashboardActions";
import { deleteProject, assignDeveloper, listProjects } from "@/actions/projectActions";
import { queueStats, searchQueue } from "@/actions/queueActions";
import { createProjectRequestField } from "@/actions/requestFormActions";
import { updateTaskStatusLabels } from "@/actions/taskStatusActions";
import {
  createUser,
  listUsers,
  updateUserRole,
  updateUserStatus,
} from "@/actions/userActions";
import { requireRole } from "@/lib/auth";
import {
  COORDINATION_ROLES,
  getRoleLabel,
  isCoordination,
  isManagerRole,
} from "@/lib/roles";
import { actAs, makeProject, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

describe("role helpers", () => {
  it("treat the tech lead exactly like the coordinator", () => {
    expect(COORDINATION_ROLES.sort()).toEqual([Role.COORDINATOR, Role.TECH_LEAD].sort());
    expect(isCoordination(Role.TECH_LEAD)).toBe(true);
    expect(isCoordination(Role.COORDINATOR)).toBe(true);
    for (const role of [Role.DEV_GLOBAL, Role.DEV_RESTRICTED, Role.REQUESTER]) {
      expect(isCoordination(role)).toBe(false);
    }
    expect(isCoordination(null)).toBe(false);
    expect(isCoordination(undefined)).toBe(false);
  });

  it("count coordination and DEV II as managers", () => {
    expect(isManagerRole(Role.TECH_LEAD)).toBe(true);
    expect(isManagerRole(Role.DEV_GLOBAL)).toBe(true);
    expect(isManagerRole(Role.DEV_RESTRICTED)).toBe(false);
    expect(isManagerRole(Role.REQUESTER)).toBe(false);
  });

  it("has a label", () => {
    expect(getRoleLabel(Role.TECH_LEAD)).toBe("Tech Lead");
  });
});

// Everything only coordinators used to be able to do, for both roles.
describe.each([Role.COORDINATOR, Role.TECH_LEAD])("as %s", (role) => {
  it("manages users", async () => {
    const me = await makeUser(role);
    const other = await makeUser(Role.REQUESTER);
    actAs(me);

    expect(await listUsers()).toMatchObject({ success: true });
    expect(await createUser({ email: "novo@teste.gov.br", role: Role.DEV_GLOBAL })).toMatchObject({ success: true });
    expect(await updateUserRole({ userId: other.id, role: Role.DEV_RESTRICTED })).toMatchObject({ success: true });
    expect(await updateUserStatus({ userId: other.id, isActive: false })).toMatchObject({ success: true });
  });

  it("can create users with the tech lead role too", async () => {
    const me = await makeUser(role);
    actAs(me);

    expect(await createUser({ email: "lead@teste.gov.br", role: Role.TECH_LEAD })).toMatchObject({ success: true });
    expect(await prisma.user.findFirstOrThrow({ where: { email: "lead@teste.gov.br" } })).toMatchObject({ role: Role.TECH_LEAD });
  });

  it("sees and triages the queue", async () => {
    const me = await makeUser(role);
    const requester = await makeUser(Role.REQUESTER);
    await makeProject(requester.id);
    actAs(me);

    expect(await searchQueue()).toMatchObject({ success: true });
    const stats = await queueStats();
    expect(stats.success && stats.data.total).toBe(1);
    const all = await listProjects();
    expect(all.success && all.data).toHaveLength(1);
  });

  it("deletes projects and assigns developers", async () => {
    const me = await makeUser(role);
    const dev = await makeUser(Role.DEV_RESTRICTED);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);
    actAs(me);

    expect(await assignDeveloper({ projectId: project.id, userId: dev.id })).toMatchObject({ success: true });
    expect(await deleteProject(project.id)).toMatchObject({ success: true });
  });

  it("configures the request form, the task columns and sees the dashboard", async () => {
    const me = await makeUser(role);
    actAs(me);

    expect(await createProjectRequestField()).toMatchObject({ success: true });
    expect(
      await updateTaskStatusLabels({
        TODO: "A fazer", IN_PROGRESS: "Em andamento", TESTING: "Testes", WAITING: "Espera",
        PAUSED: "Pausado", DONE: "Concluido", DEPLOYED: "Publicado", CANCELED: "Cancelada",
      }),
    ).toMatchObject({ success: true });
    expect(await listDashboardCharts()).toMatchObject({ success: true });
  });

  it("passes the page guards meant for coordination", async () => {
    const me = await makeUser(role);
    actAs(me);
    await expect(requireRole(COORDINATION_ROLES)).resolves.toMatchObject({ id: me.id });
  });
});

describe("a DEV II is not coordination", () => {
  it("is refused everything above", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);

    expect(await listUsers()).toMatchObject({ success: false });
    expect(await searchQueue()).toMatchObject({ success: false });
    expect(await createProjectRequestField()).toMatchObject({ success: false });
    await expect(requireRole(COORDINATION_ROLES)).rejects.toThrow("REDIRECT:/");
  });
});

describe("the last person with coordination powers", () => {
  it("can be a tech lead: with a coordinator and a tech lead, either can step down", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const lead = await makeUser(Role.TECH_LEAD);
    actAs(lead);

    expect(await updateUserRole({ userId: coord.id, role: Role.DEV_GLOBAL })).toMatchObject({ success: true });
    // now the tech lead is the only one left
    expect(await updateUserRole({ userId: lead.id, role: Role.DEV_GLOBAL })).toMatchObject({ success: false });
    expect(await updateUserStatus({ userId: lead.id, isActive: false })).toMatchObject({ success: false });
  });

  it("is protected whichever of the two roles it holds", async () => {
    const only = await makeUser(Role.COORDINATOR);
    actAs(only);
    expect(await updateUserRole({ userId: only.id, role: Role.DEV_GLOBAL })).toMatchObject({ success: false });
    // but moving between the two coordination roles keeps the powers, so it is fine
    expect(await updateUserRole({ userId: only.id, role: Role.TECH_LEAD })).toMatchObject({ success: true });
  });

  it("ignores inactive tech leads when counting", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    await makeUser(Role.TECH_LEAD, { isActive: false });
    actAs(coord);
    expect(await updateUserRole({ userId: coord.id, role: Role.DEV_GLOBAL })).toMatchObject({ success: false });
  });
});
