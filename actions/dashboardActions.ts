"use server";

import { ProjectStatus, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getPriorityLabel } from "@/lib/projectLabels";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type ChartItem = {
  label: string;
  value: number;
};

type DashboardCharts = {
  projectsByDeveloper: ChartItem[];
  openRequestsByUser: ChartItem[];
  projectsByPriority: ChartItem[];
};

async function getUserRole(): Promise<ActionResult<Role>> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  return { success: true, data: user.role };
}

function buildLabelMap(
  users: Array<{ id: string; name: string }>,
  fallback = "Desconhecido",
) {
  const map = new Map<string, string>();
  users.forEach((user) => map.set(user.id, user.name));
  return (id: string) => map.get(id) ?? fallback;
}

export async function listDashboardCharts(): Promise<
  ActionResult<DashboardCharts>
> {
  const roleResult = await getUserRole();
  if (!roleResult.success) return roleResult;

  if (roleResult.data !== Role.COORDINATOR) {
    return { success: false, error: "Sem permissao" };
  }

  const [devGroups, requesterGroups, priorityGroups] = await Promise.all([
    prisma.projectDeveloper.groupBy({
      by: ["userId"],
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 6,
    }),
    prisma.project.groupBy({
      by: ["requesterId"],
      where: {
        NOT: [
          { status: ProjectStatus.FINISHED },
          { status: ProjectStatus.CANCELED },
        ],
      },
      _count: { requesterId: true },
      orderBy: { _count: { requesterId: "desc" } },
      take: 6,
    }),
    prisma.project.groupBy({
      by: ["priority"],
      _count: { priority: true },
      orderBy: { _count: { priority: "desc" } },
    }),
  ]);

  const userIds = Array.from(
    new Set([
      ...devGroups.map((row) => row.userId),
      ...requesterGroups.map((row) => row.requesterId),
    ]),
  );

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true },
  });

  const labelFor = buildLabelMap(users);

  const projectsByDeveloper = devGroups.map((row) => ({
    label: labelFor(row.userId),
    value: row._count.userId,
  }));

  const openRequestsByUser = requesterGroups.map((row) => ({
    label: labelFor(row.requesterId),
    value: row._count.requesterId,
  }));

  const projectsByPriority = priorityGroups.map((row) => ({
    label: getPriorityLabel(row.priority),
    value: row._count.priority,
  }));

  return {
    success: true,
    data: {
      projectsByDeveloper,
      openRequestsByUser,
      projectsByPriority,
    },
  };
}
