import { beforeEach, describe, expect, it } from "vitest";
import {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
  Role,
  TaskStatus,
} from "@prisma/client";

import { getGeneralReport } from "@/actions/reportActions";
import {
  actAs,
  makeProject,
  makeTask,
  makeUser,
  prisma,
  resetDb,
} from "../helpers";

beforeEach(resetDb);

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

async function setDates(
  table: "Project" | "Task",
  id: string,
  values: { createdAt?: Date; updatedAt?: Date },
) {
  if (values.createdAt) {
    await prisma.$executeRawUnsafe(
      `update "${table}" set "createdAt" = $1 where id = $2`,
      values.createdAt,
      id,
    );
  }
  if (values.updatedAt) {
    await prisma.$executeRawUnsafe(
      `update "${table}" set "updatedAt" = $1 where id = $2`,
      values.updatedAt,
      id,
    );
  }
}

describe("getGeneralReport", () => {
  it("is refused to anyone outside coordination", async () => {
    const requester = await makeUser(Role.REQUESTER);
    const dev = await makeUser(Role.DEV_GLOBAL);

    actAs(requester);
    expect(await getGeneralReport({})).toMatchObject({ success: false });
    actAs(dev);
    expect(await getGeneralReport({})).toMatchObject({ success: false });
  });

  it("counts requests by status, priority and category within the period", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const techLead = await makeUser(Role.TECH_LEAD);
    const requester = await makeUser(Role.REQUESTER);

    const inside = await makeProject(requester.id, {
      status: ProjectStatus.IN_DEVELOPMENT,
      priority: ProjectPriority.URGENT,
    });
    await setDates("Project", inside.id, { createdAt: daysAgo(5) });
    await prisma.project.update({
      where: { id: inside.id },
      data: { category: ProjectCategory.BUG },
    });

    const outside = await makeProject(requester.id, {
      status: ProjectStatus.FINISHED,
    });
    await setDates("Project", outside.id, { createdAt: daysAgo(40) });

    actAs(coord);
    const result = await getGeneralReport({
      from: new Date(daysAgo(10)).toISOString().slice(0, 10),
      to: new Date(daysAgo(0)).toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.totalProjects).toBe(1);
    expect(result.data.byStatus[ProjectStatus.IN_DEVELOPMENT]).toBe(1);
    expect(result.data.byStatus[ProjectStatus.FINISHED]).toBe(0);
    expect(result.data.byPriority[ProjectPriority.URGENT]).toBe(1);
    expect(result.data.byCategory[ProjectCategory.BUG]).toBe(1);
    expect(result.data.byCategory.NONE).toBe(0);

    // a tech lead has the same access as a coordinator
    actAs(techLead);
    expect((await getGeneralReport({})).success).toBe(true);
  });

  it("counts every request when no period is given", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const old = await makeProject(requester.id);
    await setDates("Project", old.id, { createdAt: daysAgo(400) });
    await makeProject(requester.id);

    actAs(coord);
    const result = await getGeneralReport({});
    expect(result.success && result.data.totalProjects).toBe(2);
  });

  it("computes the average time per stage only for spans that started in the period", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);

    const changes = [
      [ProjectStatus.IN_QUEUE, daysAgo(20)], // queue span starts before the period below
      [ProjectStatus.IN_ANALYSIS, daysAgo(8)], // analysis span: 5 days, starts inside the period
      [ProjectStatus.IN_DEVELOPMENT, daysAgo(3)],
    ] as const;
    for (const [toStatus, createdAt] of changes) {
      await prisma.projectStatusChange.create({
        data: {
          projectId: project.id,
          toStatus,
          changedByName: "x",
          createdAt,
        },
      });
    }

    actAs(coord);
    const result = await getGeneralReport({
      from: new Date(daysAgo(10)).toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.avgDaysInStatus[ProjectStatus.IN_QUEUE]).toBeUndefined();
    expect(result.data.avgDaysInStatus[ProjectStatus.IN_ANALYSIS]).toBe(5);
    // still in development: that span has not ended, so it never counts
    expect(
      result.data.avgDaysInStatus[ProjectStatus.IN_DEVELOPMENT],
    ).toBeUndefined();
  });

  it("counts tasks completed in the period, and open/overdue as a live snapshot", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);

    const completedInside = await makeTask(project.id, {
      status: TaskStatus.DONE,
    });
    await setDates("Task", completedInside.id, { updatedAt: daysAgo(3) });
    const completedOutside = await makeTask(project.id, {
      status: TaskStatus.DEPLOYED,
    });
    await setDates("Task", completedOutside.id, { updatedAt: daysAgo(30) });
    await makeTask(project.id, { status: TaskStatus.IN_PROGRESS });
    const overdue = await makeTask(project.id, { status: TaskStatus.TODO });
    await prisma.task.update({
      where: { id: overdue.id },
      data: { dueDate: daysAgo(2) },
    });
    await makeTask(project.id, { status: TaskStatus.CANCELED }); // never counted

    actAs(coord);
    const result = await getGeneralReport({
      from: new Date(daysAgo(7)).toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.tasksCompletedInPeriod).toBe(1);
    expect(result.data.tasksOpenNow).toBe(2); // in progress + the overdue todo
    expect(result.data.tasksOverdueNow).toBe(1);
  });

  it("reports each active developer, even one with nothing assigned, but not inactive or other roles", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const busy = await makeUser(Role.DEV_GLOBAL, { name: "Dev Ocupado" });
    const idle = await makeUser(Role.DEV_RESTRICTED, {
      name: "Dev Sem Tarefas",
    });
    const inactive = await makeUser(Role.DEV_GLOBAL, {
      name: "Dev Inativo",
      isActive: false,
    });
    const project = await makeProject(requester.id);

    const done = await makeTask(project.id, {
      status: TaskStatus.DONE,
      assigneeId: busy.id,
    });
    await setDates("Task", done.id, { updatedAt: daysAgo(2) });
    await makeTask(project.id, {
      status: TaskStatus.IN_PROGRESS,
      assigneeId: busy.id,
    });
    const late = await makeTask(project.id, {
      status: TaskStatus.TODO,
      assigneeId: busy.id,
    });
    await prisma.task.update({
      where: { id: late.id },
      data: { dueDate: daysAgo(1) },
    });
    await makeTask(project.id, {
      status: TaskStatus.DONE,
      assigneeId: inactive.id,
    });

    actAs(coord);
    const result = await getGeneralReport({
      from: new Date(daysAgo(5)).toISOString().slice(0, 10),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const names = result.data.developers.map((d) => d.name);
    expect(names).toContain("Dev Ocupado");
    expect(names).toContain("Dev Sem Tarefas");
    expect(names).not.toContain("Dev Inativo");

    const row = result.data.developers.find((d) => d.id === busy.id);
    expect(row).toMatchObject({
      completedInPeriod: 1,
      openNow: 2,
      overdueNow: 1,
    });
    const idleRow = result.data.developers.find((d) => d.id === idle.id);
    expect(idleRow).toMatchObject({
      completedInPeriod: 0,
      openNow: 0,
      overdueNow: 0,
    });
  });
});
