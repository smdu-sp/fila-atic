import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildPayload } from "../../scripts/github-notify.mjs";
import { commitsBetween, deploy, readConfig, waitForHealth } from "../../scripts/deploy.mjs";

const PREVIOUS = "1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const NEW = "2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const config = {
  appDir: "/opt/fila-atic",
  restart: "sudo systemctl restart fila-atic",
  backup: null as string | null,
  healthUrl: "http://localhost:3003/login",
  healthWaitSeconds: 1,
};

// Records every command; `fail` makes the first command containing that text throw.
function fakeRun(fail?: string) {
  const commands: string[] = [];
  const run = vi.fn((command: string, ...rest: unknown[]) => {
    void rest;
    commands.push(command);
    if (command === "git rev-parse HEAD") return `${PREVIOUS}\n`;
    if (fail && command.includes(fail)) {
      // only the first time: the rollback runs the same commands again
      fail = undefined;
      throw new Error(`"${command}" terminou com código 1`);
    }
    return "";
  });
  return { run, commands };
}

describe("readConfig", () => {
  it("needs the app folder (a git clone) and the restart command", () => {
    expect(() => readConfig({})).toThrow(/FILA_ATIC_APP_DIR.*FILA_ATIC_RESTART_CMD/);
    expect(() => readConfig({ FILA_ATIC_APP_DIR: "/nao/existe", FILA_ATIC_RESTART_CMD: "x" })).toThrow(/não é um clone git/);
  });

  it("reads the settings and applies the defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "deploy-"));
    mkdirSync(join(dir, ".git"));

    expect(readConfig({ FILA_ATIC_APP_DIR: dir, FILA_ATIC_RESTART_CMD: "pm2 restart fila" })).toEqual({
      appDir: dir,
      restart: "pm2 restart fila",
      backup: null,
      healthUrl: "http://localhost:3003/login",
      healthWaitSeconds: 90,
    });
    expect(
      readConfig({
        FILA_ATIC_APP_DIR: dir,
        FILA_ATIC_RESTART_CMD: "x",
        FILA_ATIC_BACKUP_CMD: "pg_dump",
        FILA_ATIC_HEALTH_URL: "http://h/",
        FILA_ATIC_HEALTH_WAIT: "30",
      }),
    ).toMatchObject({ backup: "pg_dump", healthUrl: "http://h/", healthWaitSeconds: 30 });
  });
});

describe("deploy", () => {
  it("checks out the commit, installs, migrates, builds, restarts and waits for the app, in that order", async () => {
    const { run, commands } = fakeRun();

    const result = await deploy({ config, sha: NEW, run, health: async () => true, log: () => undefined });

    expect(result).toEqual({ previous: PREVIOUS, deployed: NEW });
    expect(commands).toEqual([
      "git rev-parse HEAD",
      "git fetch origin --prune",
      `git checkout --force ${NEW}`,
      "npm ci",
      "npx prisma migrate deploy",
      "npx prisma generate",
      "npm run build",
      "sudo systemctl restart fila-atic",
    ]);
    // everything runs inside the app folder
    expect(run.mock.calls.every(([, options]) => (options as { cwd: string }).cwd === "/opt/fila-atic")).toBe(true);
  });

  it("runs the backup before the migrations when one is configured", async () => {
    const { run, commands } = fakeRun();

    await deploy({ config: { ...config, backup: "pg_dump fila > /backups/a.sql" }, sha: NEW, run, health: async () => true, log: () => undefined });

    expect(commands.indexOf("pg_dump fila > /backups/a.sql")).toBeGreaterThan(commands.indexOf(`git checkout --force ${NEW}`));
    expect(commands.indexOf("pg_dump fila > /backups/a.sql")).toBeLessThan(commands.indexOf("npx prisma migrate deploy"));
  });

  it("goes back to the previous commit when the build fails, and still reports the failure", async () => {
    const { run, commands } = fakeRun("npm run build");

    const error = await deploy({ config, sha: NEW, run, health: async () => true, log: () => undefined }).catch((e) => e);

    expect(error.message).toContain("npm run build");
    expect(error).toMatchObject({ previous: PREVIOUS, sha: NEW });
    const after = commands.slice(commands.indexOf(`git checkout --force ${PREVIOUS}`));
    expect(after).toEqual([`git checkout --force ${PREVIOUS}`, "npm ci", "npx prisma generate", "npm run build", "sudo systemctl restart fila-atic"]);
  });

  it("goes back too when the app does not answer after the restart", async () => {
    const { run, commands } = fakeRun();

    await expect(deploy({ config, sha: NEW, run, health: async () => false, log: () => undefined })).rejects.toThrow(/não voltou a responder/);

    expect(commands.filter((c) => c === "sudo systemctl restart fila-atic")).toHaveLength(2);
    expect(commands).toContain(`git checkout --force ${PREVIOUS}`);
  });

  it("does not try to roll back to the very commit that failed", async () => {
    const { run, commands } = fakeRun("npm run build");

    await expect(deploy({ config, sha: PREVIOUS, run, health: async () => true, log: () => undefined })).rejects.toThrow();
    expect(commands.filter((c) => c === "npm ci")).toHaveLength(1);
  });

  it("refuses anything that is not a commit id (it ends up in a shell command)", async () => {
    const { run } = fakeRun();

    for (const bad of ["main; rm -rf /", "", "$(reboot)", "zzzzzzz"]) {
      await expect(deploy({ config, sha: bad, run, health: async () => true, log: () => undefined })).rejects.toThrow(/commit invalido/);
    }
    expect(run).not.toHaveBeenCalled();
  });
});

describe("waitForHealth", () => {
  const noWait = { sleep: async () => undefined, intervalMs: 0 };

  it("returns as soon as the app answers, treating a redirect as alive", async () => {
    const answers = [new Response("", { status: 503 }), new Response("", { status: 302 })];
    const fetchImpl = vi.fn(async () => answers.shift()!);

    expect(await waitForHealth({ url: "http://x", seconds: 5, fetchImpl: fetchImpl as never, ...noWait })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps trying through connection errors and gives up at the deadline", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    expect(await waitForHealth({ url: "http://x", seconds: 0, fetchImpl: fetchImpl as never, ...noWait })).toBe(false);
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe("commitsBetween", () => {
  it("lists the commits of the range with author and full message", () => {
    const run = vi.fn((...args: unknown[]) => (void args, `${NEW}\x1fFulana\x1ffeat: x\n\nATC-0001-3\x1e${PREVIOUS}\x1fBeltrano\x1ffix\x1e`));

    expect(commitsBetween({ appDir: "/app", from: PREVIOUS, to: NEW, run })).toEqual([
      { sha: NEW, author: "Fulana", message: "feat: x\n\nATC-0001-3" },
      { sha: PREVIOUS, author: "Beltrano", message: "fix" },
    ]);
    expect(run.mock.calls[0][0]).toContain(`${PREVIOUS}..${NEW}`);
  });

  it("takes only the last commit when there is nothing to compare with", () => {
    const run = vi.fn((...args: unknown[]) => (void args, ""));
    commitsBetween({ appDir: "/app", from: undefined, to: NEW, run });
    expect(run.mock.calls[0][0]).toContain(`-1 ${NEW}`);
  });
});

describe("a deploy notification built from what the deploy script wrote", () => {
  it("uses the branch and the commits it is given, no push event needed", () => {
    const commits = [{ sha: NEW, message: "feat ATC-0001-3", author: "Fulana" }];

    expect(buildPayload("deploy", {}, { GITHUB_REPOSITORY: "smdu-sp/fila-atic" }, { status: "success", environment: "production", branch: "main", extraCommits: commits })).toMatchObject({
      event: "deploy",
      branch: "main",
      status: "success",
      environment: "production",
      commits,
    });
  });
});
