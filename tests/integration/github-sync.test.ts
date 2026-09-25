import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Role, TaskStatus } from "@prisma/client";

import { POST } from "@/app/api/integrations/github/route";
import { createTask, listTasksByProject } from "@/actions/taskActions";
import type { GithubPayload } from "@/lib/githubPayload";
import { getGithubSettings, processGithubPayload } from "@/lib/githubSync";
import { actAs, makeProject, makeTask, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

const REPO = "smdu-sp/fila-atic";

async function setup() {
  const requester = await makeUser(Role.REQUESTER);
  const project = await makeProject(requester.id);
  const [t1, t2, t3] = [await makeTask(project.id), await makeTask(project.id), await makeTask(project.id)];
  return { project, t1, t2, t3, code: (n: number) => `ATC-${String(project.code).padStart(4, "0")}-${n}` };
}

type SettingsChange = { onPush?: TaskStatus | null; onlyForward?: boolean; repositories?: string[] };

const enable = (data: SettingsChange = {}) =>
  prisma.githubSettings.upsert({
    where: { id: "singleton" },
    update: { enabled: true, ...data },
    create: { id: "singleton", enabled: true, ...data },
  });

const send = async (payload: GithubPayload) => processGithubPayload(payload, await getGithubSettings());

// every push gets its own commit ids, as real ones would
let pushes = 0;
const push = (branch: string, ...messages: string[]): GithubPayload => ({
  event: "push",
  repository: REPO,
  branch,
  commits: messages.map((message, i) => ({
    sha: `${String(++pushes).padStart(6, "0")}${i}0123456789`,
    message,
    author: "Fulano",
    url: `https://github.com/${REPO}/commit/abcdef${i}`,
  })),
});

const statusOf = async (id: string) => (await prisma.task.findUniqueOrThrow({ where: { id } })).status;

describe("task numbers", () => {
  it("count 1, 2, 3 inside each project and show up as codes", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const a = await makeProject(requester.id);
    const b = await makeProject(requester.id);
    actAs(coord);

    await createTask({ projectId: a.id, title: "a1" });
    await createTask({ projectId: a.id, title: "a2" });
    await createTask({ projectId: b.id, title: "b1" });

    const listA = await listTasksByProject(a.id);
    const listB = await listTasksByProject(b.id);
    const pad = (n: number) => String(n).padStart(4, "0");
    expect(listA.success && listA.data.map((t) => t.code).sort()).toEqual([`ATC-${pad(a.code)}-1`, `ATC-${pad(a.code)}-2`]);
    expect(listB.success && listB.data.map((t) => t.code)).toEqual([`ATC-${pad(b.code)}-1`]);
  });

  it("are never reused after a task is deleted", async () => {
    const { project, t3 } = await setup();
    await prisma.task.delete({ where: { id: t3.id } });

    const next = await makeTask(project.id);
    expect(next.number).toBe(4);
  });

  it("stay unique when many tasks are created at the same time", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    const requester = await makeUser(Role.REQUESTER);
    const project = await makeProject(requester.id);
    actAs(coord);

    await Promise.all(Array.from({ length: 12 }, (_, i) => createTask({ projectId: project.id, title: `t${i}` })));

    const numbers = (await prisma.task.findMany({ where: { projectId: project.id } })).map((t) => t.number).sort((x, y) => x - y);
    expect(numbers).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });
});

describe("commits", () => {
  it("move a task from the column it is in and record the commit on it", async () => {
    const { t1, code } = await setup();
    await enable();

    const result = await send(push("feature/login", `feat: tela de login (${code(1)})`));

    expect(result.tasks).toEqual([{ code: code(1), action: "moved", from: TaskStatus.TODO, to: TaskStatus.IN_PROGRESS }]);
    expect(await statusOf(t1.id)).toBe(TaskStatus.IN_PROGRESS);

    const activity = await prisma.taskGithubActivity.findMany({ where: { taskId: t1.id } });
    expect(activity).toMatchObject([
      { kind: "commit", title: `feat: tela de login (${code(1)})`, author: "Fulano", movedTo: TaskStatus.IN_PROGRESS },
    ]);
    const log = await prisma.projectLog.findFirstOrThrow({ where: { authorName: "GitHub" } });
    expect(log.message).toContain("A fazer -> Em andamento");
    expect(await prisma.githubEvent.findMany()).toMatchObject([{ kind: "push", outcome: "processed" }]);
  });

  it("find the code in the branch name too, and handle several tasks and several commits", async () => {
    const { t1, t2, t3, code } = await setup();
    await enable();

    const result = await send(push(`feature/${code(3)}-algo`, "wip", `fix ${code(1)} e ${code(2)}`));

    expect(await statusOf(t3.id)).toBe(TaskStatus.IN_PROGRESS);
    expect(await statusOf(t1.id)).toBe(TaskStatus.IN_PROGRESS);
    expect(await statusOf(t2.id)).toBe(TaskStatus.IN_PROGRESS);
    expect(result.tasks.filter((t) => t.action === "moved")).toHaveLength(3);
  });

  it("on the main branch mean done, and a deploy means deployed", async () => {
    const { t1, code } = await setup();
    await enable();

    await send(push("main", `merge ${code(1)}`));
    expect(await statusOf(t1.id)).toBe(TaskStatus.DONE);

    const deploy = await send({
      event: "deploy",
      repository: REPO,
      branch: "main",
      status: "success",
      environment: "production",
      commits: [{ sha: "abcdef00123456789", message: `merge ${code(1)}` }],
    });
    expect(deploy.tasks).toMatchObject([{ action: "moved", to: TaskStatus.DEPLOYED }]);
    expect(await statusOf(t1.id)).toBe(TaskStatus.DEPLOYED);
  });

  it("never pull a task back, unless the rule allows it", async () => {
    const { t1, code } = await setup();
    await enable();
    await prisma.task.update({ where: { id: t1.id }, data: { status: TaskStatus.DONE } });

    const result = await send(push("feature/x", `mais um ajuste ${code(1)}`));
    expect(result.tasks).toEqual([{ code: code(1), action: "linked" }]);
    expect(await statusOf(t1.id)).toBe(TaskStatus.DONE);

    await enable({ onlyForward: false });
    await send(push("feature/x", `outro ajuste ${code(1)}`));
    expect(await statusOf(t1.id)).toBe(TaskStatus.IN_PROGRESS);
  });

  it("leave the column alone when the rule for the event is off, and never revive a cancelled task", async () => {
    const { t1, t2, code } = await setup();
    await enable({ onPush: null });
    await prisma.task.update({ where: { id: t2.id }, data: { status: TaskStatus.CANCELED } });

    await send(push("feature/x", `${code(1)} ${code(2)}`));
    expect(await statusOf(t1.id)).toBe(TaskStatus.TODO);

    await enable({ onPush: TaskStatus.IN_PROGRESS });
    await send(push("feature/y", `depois ${code(2)}`));
    expect(await statusOf(t2.id)).toBe(TaskStatus.CANCELED);
    // still shown on the task
    expect(await prisma.taskGithubActivity.count({ where: { taskId: t2.id } })).toBe(2);
  });

  it("are harmless when delivered twice", async () => {
    const { t1, code } = await setup();
    await enable();
    const payload = push("feature/x", `feat ${code(1)}`);

    await send(payload);
    const again = await send(payload);

    expect(again.tasks).toEqual([{ code: code(1), action: "duplicate" }]);
    expect(await prisma.taskGithubActivity.count({ where: { taskId: t1.id } })).toBe(1);
    expect(await prisma.projectLog.count({ where: { authorName: "GitHub" } })).toBe(1);
  });

  it("report unknown codes and ignore pushes that cite nothing", async () => {
    const { code } = await setup();
    await enable();

    const unknown = await send(push("feature/x", `feat ${code(99)}`));
    expect(unknown.tasks).toEqual([{ code: code(99), action: "not_found" }]);

    const nothing = await send(push("feature/x", "chore: atualiza dependências"));
    expect(nothing).toMatchObject({ outcome: "ignored", tasks: [] });
    expect(await prisma.githubEvent.count()).toBe(2);
  });
});

describe("pull requests", () => {
  const pr = (
    state: "opened" | "merged" | "closed",
    extra: Partial<Extract<GithubPayload, { event: "pull_request" }>> = {},
  ): GithubPayload => ({
    event: "pull_request",
    repository: REPO,
    state,
    number: 7,
    title: "Login",
    branch: "feature/login",
    ...extra,
  });

  it("opened means testing, merged means done, closed only records", async () => {
    const { t1, t2, t3, code } = await setup();
    await enable();

    await send(pr("opened", { title: `Login (${code(1)})` }));
    expect(await statusOf(t1.id)).toBe(TaskStatus.TESTING);

    await send(pr("merged", { title: `Login (${code(1)})` }));
    expect(await statusOf(t1.id)).toBe(TaskStatus.DONE);

    await send(pr("closed", { number: 8, body: `Relacionado a ${code(2)}` }));
    expect(await statusOf(t2.id)).toBe(TaskStatus.TODO);
    expect(await prisma.taskGithubActivity.count({ where: { taskId: t2.id } })).toBe(1);

    // the description and the branch are searched too
    await send(pr("opened", { number: 9, title: "sem código", branch: `feature/${code(3)}-x` }));
    expect(await statusOf(t3.id)).toBe(TaskStatus.TESTING);
  });
});

describe("deploys", () => {
  it("that failed are recorded without moving anything", async () => {
    const { t1, code } = await setup();
    await enable();
    await prisma.task.update({ where: { id: t1.id }, data: { status: TaskStatus.DONE } });

    await send({
      event: "deploy",
      repository: REPO,
      branch: "main",
      status: "failure",
      commits: [{ sha: "abcdef00123456789", message: `x ${code(1)}` }],
    });

    expect(await statusOf(t1.id)).toBe(TaskStatus.DONE);
    expect((await prisma.taskGithubActivity.findFirstOrThrow({ where: { taskId: t1.id } })).title).toContain("falhou");
  });
});

describe("repositories and ping", () => {
  it("ignore repositories outside the allowed list (case-insensitive)", async () => {
    const { t1, code } = await setup();
    await enable({ repositories: ["Outra-Org/outro-repo"] });

    const result = await send(push("main", `x ${code(1)}`));
    expect(result.outcome).toBe("ignored");
    expect(await statusOf(t1.id)).toBe(TaskStatus.TODO);

    await enable({ repositories: ["SMDU-SP/Fila-Atic"] });
    expect((await send(push("main", `x ${code(1)}`))).outcome).toBe("processed");
  });

  it("answer a ping and log it", async () => {
    await enable();
    const result = await send({ event: "ping", repository: REPO });
    expect(result).toMatchObject({ outcome: "processed", tasks: [] });
    expect(await prisma.githubEvent.findMany()).toMatchObject([{ kind: "ping" }]);
  });
});

describe("POST /api/integrations/github", () => {
  const original = process.env.GITHUB_INTEGRATION_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.GITHUB_INTEGRATION_TOKEN;
    else process.env.GITHUB_INTEGRATION_TOKEN = original;
  });

  const call = (body: unknown, token: string | null = "segredo") =>
    POST(
      new Request("http://localhost/api/integrations/github", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  it("is off without a token, and refuses a missing or wrong one", async () => {
    delete process.env.GITHUB_INTEGRATION_TOKEN;
    expect((await call({ event: "ping", repository: REPO })).status).toBe(503);

    process.env.GITHUB_INTEGRATION_TOKEN = "segredo";
    expect((await call({ event: "ping", repository: REPO }, null)).status).toBe(401);
    expect((await call({ event: "ping", repository: REPO }, "errado")).status).toBe(401);
    expect(await prisma.githubEvent.count()).toBe(0);
  });

  it("refuses while the integration is disabled", async () => {
    process.env.GITHUB_INTEGRATION_TOKEN = "segredo";
    expect((await call({ event: "ping", repository: REPO })).status).toBe(403);
  });

  it("rejects bodies that are not valid", async () => {
    process.env.GITHUB_INTEGRATION_TOKEN = "segredo";
    await enable();

    expect((await call("{nao json")).status).toBe(400);
    expect((await call({ event: "push", repository: "sem-barra", branch: "main", commits: [] })).status).toBe(400);
    expect((await call({ event: "desconhecido", repository: REPO })).status).toBe(400);
    expect((await call({ event: "push", repository: REPO, branch: "main", commits: [{ sha: "curto", message: "x" }] })).status).toBe(400);
  });

  it("processes a push end to end", async () => {
    const { t1, code } = await setup();
    process.env.GITHUB_INTEGRATION_TOKEN = "segredo";
    await enable();

    const response = await call(push("feature/x", `feat ${code(1)}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, outcome: "processed", tasks: [{ action: "moved", to: "IN_PROGRESS" }] });
    expect(await statusOf(t1.id)).toBe(TaskStatus.IN_PROGRESS);
  });
});
