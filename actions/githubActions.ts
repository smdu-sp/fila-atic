"use server";

import type { GithubEvent, GithubSettings } from "@prisma/client";
import { TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { getGithubSettings } from "@/lib/githubSync";
import { prisma } from "@/lib/prisma";
import { isCoordination } from "@/lib/roles";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type GithubAdminData = {
  settings: GithubSettings;
  // GITHUB_INTEGRATION_TOKEN is set on the server (its value never leaves it)
  tokenConfigured: boolean;
  events: GithubEvent[];
};

async function coordinationOrError(): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!isCoordination(user.role)) return { success: false, error: "Sem permissao" };
  return { success: true, data: null };
}

export async function getGithubAdmin(): Promise<ActionResult<GithubAdminData>> {
  const auth = await coordinationOrError();
  if (!auth.success) return auth;

  const [settings, events] = await Promise.all([
    getGithubSettings(),
    prisma.githubEvent.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
  ]);

  return {
    success: true,
    data: { settings, tokenConfigured: Boolean(process.env.GITHUB_INTEGRATION_TOKEN), events },
  };
}

export type GithubSettingsInput = {
  enabled: boolean;
  // one "owner/name" per entry; empty accepts any repository
  repositories: string[];
  mainBranch: string;
  // null: the event does not move tasks
  onPush: TaskStatus | null;
  onPullRequestOpened: TaskStatus | null;
  onMerge: TaskStatus | null;
  onDeploy: TaskStatus | null;
  onlyForward: boolean;
};

const REPOSITORY = /^[\w.-]+\/[\w.-]+$/;
const validStatus = (value: unknown) =>
  value === null || Object.values(TaskStatus).includes(value as TaskStatus);

export async function updateGithubSettings(
  input: GithubSettingsInput,
): Promise<ActionResult<void>> {
  const auth = await coordinationOrError();
  if (!auth.success) return auth;

  const repositories = Array.from(
    new Set((input.repositories ?? []).map((repo) => String(repo).trim()).filter(Boolean)),
  );
  if (repositories.some((repo) => !REPOSITORY.test(repo))) {
    return { success: false, error: 'Repositorio invalido (use o formato "organizacao/repositorio")' };
  }

  const mainBranch = String(input.mainBranch ?? "").trim();
  if (!mainBranch || mainBranch.length > 100) {
    return { success: false, error: "Informe a branch principal" };
  }

  const statuses = [input.onPush, input.onPullRequestOpened, input.onMerge, input.onDeploy];
  if (!statuses.every(validStatus)) {
    return { success: false, error: "Status invalido" };
  }

  const data = {
    enabled: input.enabled === true,
    repositories,
    mainBranch,
    onPush: input.onPush,
    onPullRequestOpened: input.onPullRequestOpened,
    onMerge: input.onMerge,
    onDeploy: input.onDeploy,
    onlyForward: input.onlyForward !== false,
  };

  await prisma.githubSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  revalidatePath("/administracao/github");
  return { success: true, data: undefined };
}
