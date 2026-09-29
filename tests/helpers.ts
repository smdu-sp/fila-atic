import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { getServerSession } from "next-auth";
import {
  ProjectPriority,
  ProjectStatus,
  Role,
  TaskStatus,
  type User,
} from "@prisma/client";

import { sendMail } from "@/lib/mail";
import { prisma } from "@/lib/prisma";

export async function resetDb() {
  const dbName = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!dbName.endsWith("_test")) {
    throw new Error(`Recusando limpar o banco ${dbName}`);
  }

  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '_prisma_migrations'`;
  // TRUNCATE is very slow on Docker volumes (~200 ms per table), DELETE is not.
  // With FK triggers off for this transaction the table order does not matter.
  await prisma.$transaction([
    prisma.$executeRawUnsafe("SET LOCAL session_replication_role = replica"),
    ...tables.map((table) =>
      prisma.$executeRawUnsafe(`DELETE FROM "${table.tablename}"`),
    ),
  ]);

  // Files that test the real lib/mail.ts (tests/unit/mail.test.ts) unmock it,
  // so sendMail is not a mock function there; resetDb still works for them.
  if (vi.isMockFunction(sendMail)) vi.mocked(sendMail).mockClear();
  actAs(null);
}

export async function makeUser(
  role: Role = Role.REQUESTER,
  overrides: Partial<Pick<User, "name" | "email" | "isActive" | "isGuest">> = {},
) {
  const id = randomUUID();
  return prisma.user.create({
    data: {
      login: overrides.email ?? `${id}@teste.gov.br`,
      email: overrides.email ?? `${id}@teste.gov.br`,
      name: overrides.name ?? `Usuario ${role} ${id.slice(0, 4)}`,
      department: "Setor de Teste",
      role,
      isActive: overrides.isActive ?? true,
      isGuest: overrides.isGuest ?? false,
    },
  });
}

// Signs the given user in for the next calls (null = anonymous).
export function actAs(user: Pick<User, "id"> | null) {
  vi.mocked(getServerSession).mockResolvedValue(
    user ? ({ user: { id: user.id } } as never) : null,
  );
}

export async function makeProject(
  requesterId: string,
  data: Partial<{
    title: string;
    status: ProjectStatus;
    priority: ProjectPriority;
    trackingToken: string;
  }> = {},
) {
  return prisma.project.create({
    data: {
      title: data.title ?? "Projeto de teste",
      description: "Descricao do projeto de teste",
      justification: "Justificativa do projeto de teste",
      status: data.status ?? ProjectStatus.IN_QUEUE,
      priority: data.priority ?? ProjectPriority.MEDIUM,
      trackingToken: data.trackingToken,
      requesterId,
    },
  });
}

export async function assignToProject(projectId: string, userId: string) {
  return prisma.projectDeveloper.create({ data: { projectId, userId } });
}

export async function makeTask(
  projectId: string,
  data: Partial<{
    title: string;
    status: TaskStatus;
    assigneeId: string | null;
  }> = {},
) {
  return prisma.task.create({
    data: {
      projectId,
      title: data.title ?? "Tarefa de teste",
      status: data.status ?? TaskStatus.TODO,
      assigneeId: data.assigneeId ?? null,
    },
  });
}

export const mailsSent = () => vi.mocked(sendMail).mock.calls.map(([m]) => m);

export { prisma };
