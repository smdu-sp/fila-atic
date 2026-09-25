import { beforeEach, describe, expect, it } from "vitest";
import { Role, TaskStatus } from "@prisma/client";

import { getGithubAdmin, updateGithubSettings, type GithubSettingsInput } from "@/actions/githubActions";
import { actAs, makeUser, prisma, resetDb } from "../helpers";

beforeEach(resetDb);

const valid: GithubSettingsInput = {
  enabled: true,
  repositories: ["smdu-sp/fila-atic"],
  mainBranch: "main",
  onPush: TaskStatus.IN_PROGRESS,
  onPullRequestOpened: TaskStatus.TESTING,
  onMerge: TaskStatus.DONE,
  onDeploy: null,
  onlyForward: true,
};

describe("GitHub settings", () => {
  it("are for coordination and tech lead only", async () => {
    const lead = await makeUser(Role.TECH_LEAD);
    const coord = await makeUser(Role.COORDINATOR);

    for (const user of [await makeUser(Role.DEV_GLOBAL), await makeUser(Role.DEV_RESTRICTED), await makeUser(Role.REQUESTER)]) {
      actAs(user);
      expect(await getGithubAdmin()).toMatchObject({ success: false, error: "Sem permissao" });
      expect(await updateGithubSettings(valid)).toMatchObject({ success: false, error: "Sem permissao" });
    }
    actAs(null);
    expect(await getGithubAdmin()).toMatchObject({ success: false });

    for (const user of [lead, coord]) {
      actAs(user);
      expect(await getGithubAdmin()).toMatchObject({ success: true });
      expect(await updateGithubSettings(valid)).toMatchObject({ success: true });
    }
  });

  it("start off, with the default rules, and never expose the token", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);
    const previous = process.env.GITHUB_INTEGRATION_TOKEN;
    process.env.GITHUB_INTEGRATION_TOKEN = "valor-secreto";

    const result = await getGithubAdmin();
    if (!result.success) throw new Error(result.error);

    expect(result.data.settings).toMatchObject({
      enabled: false,
      repositories: [],
      mainBranch: "main",
      onPush: TaskStatus.IN_PROGRESS,
      onPullRequestOpened: TaskStatus.TESTING,
      onMerge: TaskStatus.DONE,
      onDeploy: TaskStatus.DEPLOYED,
      onlyForward: true,
    });
    expect(result.data.tokenConfigured).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain("valor-secreto");

    if (previous === undefined) delete process.env.GITHUB_INTEGRATION_TOKEN;
    else process.env.GITHUB_INTEGRATION_TOKEN = previous;
  });

  it("are saved, with repositories trimmed and repeated ones dropped", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);

    await updateGithubSettings({ ...valid, repositories: [" smdu-sp/fila-atic ", "smdu-sp/fila-atic", "", "outra/repo"], onDeploy: null, onlyForward: false });

    expect(await prisma.githubSettings.findUniqueOrThrow({ where: { id: "singleton" } })).toMatchObject({
      enabled: true,
      repositories: ["smdu-sp/fila-atic", "outra/repo"],
      onDeploy: null,
      onlyForward: false,
    });
    expect(await prisma.githubSettings.count()).toBe(1);
  });

  it("refuse malformed repositories, an empty main branch and unknown statuses", async () => {
    const coord = await makeUser(Role.COORDINATOR);
    actAs(coord);

    expect(await updateGithubSettings({ ...valid, repositories: ["sem-barra"] })).toMatchObject({ success: false });
    expect(await updateGithubSettings({ ...valid, repositories: ["https://github.com/a/b"] })).toMatchObject({ success: false });
    expect(await updateGithubSettings({ ...valid, mainBranch: "  " })).toMatchObject({ success: false });
    expect(await updateGithubSettings({ ...valid, onPush: "VOANDO" as TaskStatus })).toMatchObject({ success: false });
    expect(await prisma.githubSettings.count()).toBe(0);
  });
});
