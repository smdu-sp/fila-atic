import { beforeEach, describe, expect, it } from "vitest";
import { ProjectStatus, Role, TaskStatus } from "@prisma/client";

import { getDashboardMetrics } from "@/actions/dashboardActions";
import { getGeneralReport } from "@/actions/reportActions";
import {
  actAs,
  makeProject,
  makeUser,
  prisma,
  resetDb,
} from "../helpers";

beforeEach(resetDb);

const DAY = 86_400_000;

describe("getDashboardMetrics", () => {
  it("is refused to requesters and anonymous visitors", async () => {
    const requester = await makeUser(Role.REQUESTER);

    actAs(requester);
    expect(await getDashboardMetrics()).toMatchObject({ success: false });
    actAs(null);
    expect(await getDashboardMetrics()).toMatchObject({ success: false });
  });

  it("gives coordination every task, the timeline and the workload per developer", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const dev = await makeUser(Role.DEV_GLOBAL, { name: "Dev Um" });
    const other = await makeUser(Role.DEV_RESTRICTED, { name: "Dev Dois" });
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);

    const yesterday = new Date(Date.now() - DAY);
    await prisma.task.createMany({
      data: [
        { projectId: project.id, title: "a", assigneeId: dev.id, status: TaskStatus.TODO, dueDate: yesterday },
        { projectId: project.id, title: "b", assigneeId: dev.id, status: TaskStatus.IN_PROGRESS },
        { projectId: project.id, title: "c", assigneeId: other.id, status: TaskStatus.DONE },
      ],
    });
    await prisma.projectStatusChange.create({
      data: { projectId: project.id, toStatus: ProjectStatus.FINISHED, changedByName: "Teste" },
    });

    actAs(coord);
    const result = await getDashboardMetrics();
    if (!result.success) throw new Error(result.error);

    expect(result.data.scope).toBe("all");
    expect(result.data.tasksByStatus).toMatchObject({ TODO: 1, IN_PROGRESS: 1, DONE: 1, CANCELED: 0 });
    expect(result.data.workload).toEqual([
      { id: other.id, name: "Dev Dois", open: 0, overdue: 0 },
      { id: dev.id, name: "Dev Um", open: 2, overdue: 1 },
    ]);
    const timeline = result.data.timeline!;
    expect(timeline.granularity).toBe("week");
    expect(timeline.buckets.reduce((sum, b) => sum + b.created, 0)).toBe(1);
    expect(timeline.buckets.reduce((sum, b) => sum + b.finished, 0)).toBe(1);
  });

  it("gives a developer only their own tasks, without the coordination extras", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    const other = await makeUser(Role.DEV_GLOBAL);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);
    await prisma.task.createMany({
      data: [
        { projectId: project.id, title: "minha", assigneeId: dev.id, status: TaskStatus.TESTING },
        { projectId: project.id, title: "dela", assigneeId: other.id, status: TaskStatus.TODO },
      ],
    });

    actAs(dev);
    const result = await getDashboardMetrics();
    if (!result.success) throw new Error(result.error);

    expect(result.data.scope).toBe("mine");
    expect(result.data.tasksByStatus).toMatchObject({ TESTING: 1, TODO: 0 });
    expect(result.data.timeline).toBeNull();
    expect(result.data.workload).toBeNull();
  });
});

describe("report timeline and task breakdown", () => {
  it("counts requests opened and finished inside the period, and tasks by status", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);
    await prisma.task.create({ data: { projectId: project.id, title: "t", status: TaskStatus.WAITING } });
    await prisma.projectStatusChange.create({
      data: { projectId: project.id, toStatus: ProjectStatus.FINISHED, changedByName: "Teste" },
    });

    actAs(coord);
    const result = await getGeneralReport({});
    if (!result.success) throw new Error(result.error);

    expect(result.data.tasksByStatus.WAITING).toBe(1);
    const sum = (field: "created" | "finished") =>
      result.data.timeline.buckets.reduce((total, b) => total + b[field], 0);
    expect(sum("created")).toBe(1);
    expect(sum("finished")).toBe(1);
  });
});
