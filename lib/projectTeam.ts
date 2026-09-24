import type { Prisma, PrismaClient } from "@prisma/client";
import { isAssignableRole } from "@/lib/roles";

type Db = PrismaClient | Prisma.TransactionClient;

// Whoever holds a task must belong to the project team; otherwise a restricted
// developer could not even see the task assigned to them. Coordinators are not
// added: they already see every project.
export async function ensureTeamMember(
  db: Db,
  projectId: string,
  userId: string,
  byName: string,
) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, role: true },
  });

  if (!user || !isAssignableRole(user.role)) {
    return;
  }

  const existing = await db.projectDeveloper.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (existing) return;

  await db.projectDeveloper.create({ data: { projectId, userId } });
  await db.projectLog.create({
    data: {
      projectId,
      message: `${user.name} foi adicionado(a) a equipe do projeto ao receber uma tarefa.`,
      authorName: byName,
      isInternal: true,
    },
  });
}
