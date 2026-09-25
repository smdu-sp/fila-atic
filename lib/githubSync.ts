import { Prisma, TaskStatus, type GithubSettings } from "@prisma/client";
import { revalidatePath } from "next/cache";

import type { GithubPayload } from "@/lib/githubPayload";
import { resolveTargetStatus } from "@/lib/githubRules";
import { prisma } from "@/lib/prisma";
import { formatTaskCode, extractTaskRefs } from "@/lib/taskCode";
import { getTaskStatusLabel } from "@/lib/projectLabels";
import { touchProject } from "@/lib/projectStatus";

// What GitHub tells the board: a commit, a pull request or a deploy that cites
// a task code ("ATC-0001-3") is recorded on that task and, following the rules
// in GithubSettings, moves it to another column. Every delivery is also logged
// in GithubEvent so the coordination can see what arrived and what happened.

export type TaskOutcome = {
  code: string;
  // moved: changed column; linked: recorded, column kept; duplicate: already
  // known (a workflow re-run); not_found: no such task
  action: "moved" | "linked" | "duplicate" | "not_found";
  from?: TaskStatus;
  to?: TaskStatus;
};

export type SyncResult = {
  outcome: "processed" | "ignored";
  summary: string;
  tasks: TaskOutcome[];
};

// One thing that happened on GitHub and may cite tasks.
type Item = {
  kind: "commit" | "pull_request" | "deploy";
  dedupeKey: string;
  // where task codes are looked for
  text: string;
  title: string;
  url?: string;
  sha?: string;
  author?: string;
  target: TaskStatus | null;
  // what the log line says about it ("commit abc1234 por Fulano")
  origin: string;
};

const firstLine = (text: string) => text.split("\n")[0].trim().slice(0, 200);
const short = (sha: string) => sha.slice(0, 7);

export async function getGithubSettings(): Promise<GithubSettings> {
  return prisma.githubSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

const sameRepository = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function itemsFor(payload: GithubPayload, settings: GithubSettings): Item[] {
  switch (payload.event) {
    case "push": {
      const onMain = payload.branch === settings.mainBranch;

      return payload.commits.map((commit) => ({
        kind: "commit" as const,
        dedupeKey: `commit:${commit.sha}`,
        // the branch name counts too: "feature/ATC-0001-3-login"
        text: `${commit.message}\n${payload.branch}`,
        title: firstLine(commit.message),
        url: commit.url,
        sha: commit.sha,
        author: commit.author,
        target: onMain ? settings.onMerge : settings.onPush,
        origin: `commit ${short(commit.sha)}${commit.author ? ` por ${commit.author}` : ""} em ${payload.branch}`,
      }));
    }

    case "pull_request": {
      const labels = { opened: "aberto", merged: "integrado", closed: "fechado sem integrar" } as const;
      const target =
        payload.state === "opened"
          ? settings.onPullRequestOpened
          : payload.state === "merged"
            ? settings.onMerge
            : null;

      return [
        {
          kind: "pull_request" as const,
          dedupeKey: `pr:${payload.number}:${payload.state}`,
          text: `${payload.title}\n${payload.body ?? ""}\n${payload.branch}`,
          title: `PR #${payload.number} ${labels[payload.state]}: ${firstLine(payload.title)}`,
          url: payload.url,
          author: payload.author,
          target,
          origin: `pull request #${payload.number} (${labels[payload.state]})`,
        },
      ];
    }

    case "deploy": {
      const where = payload.environment ? ` em ${payload.environment}` : "";
      const ok = payload.status === "success";

      return payload.commits.map((commit) => ({
        kind: "deploy" as const,
        dedupeKey: `deploy:${payload.status}:${commit.sha}`,
        text: `${commit.message}\n${payload.branch}`,
        title: `Deploy${where} ${ok ? "concluído" : "falhou"}: ${firstLine(commit.message)}`,
        url: payload.url ?? commit.url,
        sha: commit.sha,
        author: commit.author,
        target: ok ? settings.onDeploy : null,
        origin: `deploy${where} (${short(commit.sha)})`,
      }));
    }

    default:
      return [];
  }
}

async function findTasks(refs: Array<{ projectCode: number; number: number }>) {
  if (!refs.length) return new Map<string, { id: string }>();

  const tasks = await prisma.task.findMany({
    where: {
      OR: refs.map((ref) => ({ number: ref.number, project: { code: ref.projectCode } })),
    },
    select: { id: true, number: true, project: { select: { code: true } } },
  });

  return new Map(tasks.map((task) => [`${task.project.code}-${task.number}`, task]));
}

// Records one item on one task and moves the task if the rules say so.
async function applyToTask(
  taskId: string,
  code: string,
  item: Item,
  settings: GithubSettings,
): Promise<TaskOutcome> {
  try {
    return await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { id: true, title: true, status: true, projectId: true },
      });

      const already = await tx.taskGithubActivity.findUnique({
        where: { taskId_dedupeKey: { taskId, dedupeKey: item.dedupeKey } },
        select: { id: true },
      });
      if (already) return { code, action: "duplicate" as const };

      const to = resolveTargetStatus(task.status, item.target, settings.onlyForward);

      if (to) {
        await tx.task.update({
          where: { id: taskId },
          // on top of the new column, like a task just created there
          data: { status: to, position: -(Date.now() / 1000) },
        });
        await tx.projectLog.create({
          data: {
            projectId: task.projectId,
            message: `Tarefa "${task.title}" (${code}) movida pelo GitHub. Status: ${getTaskStatusLabel(task.status)} -> ${getTaskStatusLabel(to)}. Origem: ${item.origin}.`,
            authorName: "GitHub",
            isInternal: true,
          },
        });
        await touchProject(tx, task.projectId);
      }

      await tx.taskGithubActivity.create({
        data: {
          taskId,
          kind: item.kind,
          dedupeKey: item.dedupeKey,
          title: item.title || item.origin,
          url: item.url,
          sha: item.sha,
          author: item.author,
          movedTo: to,
        },
      });

      return to
        ? { code, action: "moved" as const, from: task.status, to }
        : { code, action: "linked" as const };
    });
  } catch (error) {
    // two deliveries of the same event at once: the other one won
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { code, action: "duplicate" };
    }
    throw error;
  }
}

async function logEvent(payload: GithubPayload, result: SyncResult) {
  const ref = "branch" in payload ? payload.branch : null;

  await prisma.githubEvent.create({
    data: {
      kind: payload.event,
      repository: payload.repository,
      ref,
      summary: result.summary,
      outcome: result.outcome,
      detail: result.tasks.length ? JSON.stringify(result.tasks) : null,
    },
  });
}

function describe(payload: GithubPayload) {
  switch (payload.event) {
    case "ping":
      return "Teste de conexão";
    case "push":
      return `${payload.commits.length} commit(s) em ${payload.branch}`;
    case "pull_request":
      return `Pull request #${payload.number} (${payload.state})`;
    case "deploy":
      return `Deploy ${payload.status === "success" ? "concluído" : "com falha"} em ${payload.branch}`;
  }
}

export async function processGithubPayload(
  payload: GithubPayload,
  settings: GithubSettings,
): Promise<SyncResult> {
  const base = describe(payload);

  if (
    settings.repositories.length &&
    !settings.repositories.some((repo) => sameRepository(repo, payload.repository))
  ) {
    const result: SyncResult = {
      outcome: "ignored",
      summary: `${base} — repositório ${payload.repository} não está na lista autorizada`,
      tasks: [],
    };
    await logEvent(payload, result);
    return result;
  }

  if (payload.event === "ping") {
    const result: SyncResult = { outcome: "processed", summary: base, tasks: [] };
    await logEvent(payload, result);
    return result;
  }

  const items = itemsFor(payload, settings);

  // every task code cited anywhere in this delivery, looked up in one query
  const cited = items.map((item) => ({ item, refs: extractTaskRefs(item.text) }));
  const unique = new Map<string, { projectCode: number; number: number }>();
  cited.forEach(({ refs }) => refs.forEach((ref) => unique.set(`${ref.projectCode}-${ref.number}`, ref)));
  const tasks = await findTasks([...unique.values()]);

  const outcomes: TaskOutcome[] = [];
  for (const { item, refs } of cited) {
    for (const ref of refs) {
      const code = formatTaskCode(ref.projectCode, ref.number);
      const task = tasks.get(`${ref.projectCode}-${ref.number}`);

      if (!task) {
        // reported once per delivery, however many commits cite it
        if (!outcomes.some((entry) => entry.code === code && entry.action === "not_found")) {
          outcomes.push({ code, action: "not_found" });
        }
        continue;
      }

      outcomes.push(await applyToTask(task.id, code, item, settings));
    }
  }

  const moved = outcomes.filter((entry) => entry.action === "moved").length;
  const linked = outcomes.filter((entry) => entry.action === "linked" || entry.action === "moved").length;
  const result: SyncResult = {
    outcome: outcomes.length ? "processed" : "ignored",
    summary: outcomes.length
      ? `${base} — ${linked} tarefa(s) atualizada(s), ${moved} movida(s)`
      : `${base} — nenhum código de tarefa citado`,
    tasks: outcomes,
  };

  await logEvent(payload, result);

  if (moved || linked) {
    revalidatePath("/kanban");
    revalidatePath("/logs");
    revalidatePath("/projetos");
  }

  return result;
}
