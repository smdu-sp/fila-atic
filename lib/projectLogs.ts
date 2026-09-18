import { prisma } from "@/lib/prisma";

type ProjectLogInput = {
  projectId: string;
  message: string;
  authorName: string;
  isInternal?: boolean;
};

export async function createProjectLog({
  projectId,
  message,
  authorName,
  isInternal = true,
}: ProjectLogInput) {
  return prisma.projectLog.create({
    data: {
      projectId,
      message,
      authorName,
      isInternal,
    },
  });
}
