import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function canAccessProject(
  userId: string,
  role: Role,
  projectId: string,
) {
  if (role === Role.REQUESTER) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { requesterId: true },
    });

    return project?.requesterId === userId;
  }

  if (role === Role.DEV_RESTRICTED) {
    const assignment = await prisma.projectDeveloper.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    return Boolean(assignment);
  }

  return true;
}
