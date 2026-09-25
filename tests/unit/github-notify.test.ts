import { describe, expect, it, vi } from "vitest";

import { buildPayload, commitsFromPush, send } from "../../scripts/github-notify.mjs";

const env = { GITHUB_REPOSITORY: "smdu-sp/fila-atic", GITHUB_SERVER_URL: "https://github.com", GITHUB_RUN_ID: "42" };

// Trimmed copies of what GitHub really puts in GITHUB_EVENT_PATH.
const pushEvent = {
  ref: "refs/heads/feature/ATC-0001-3-login",
  before: "1111111111111111111111111111111111111111",
  after: "2222222222222222222222222222222222222222",
  repository: { full_name: "smdu-sp/fila-atic" },
  commits: [
    {
      id: "aaaaaaa1111111111111111111111111111111111",
      message: "feat: login\n\nCorpo do commit ATC-0001-3",
      author: { name: "Fulana de Tal", username: "fulana" },
      url: "https://github.com/smdu-sp/fila-atic/commit/aaaaaaa",
    },
    { id: "bbbbbbb2222222222222222222222222222222222", message: "fix", author: { name: "Sem Usuario" } },
  ],
};

const prEvent = (action: string, extra: Record<string, unknown> = {}) => ({
  action,
  repository: { full_name: "smdu-sp/fila-atic" },
  pull_request: {
    number: 12,
    title: "Login (ATC-0001-3)",
    body: "Descrição",
    merged: false,
    head: { ref: "feature/login" },
    user: { login: "fulana" },
    html_url: "https://github.com/smdu-sp/fila-atic/pull/12",
    ...extra,
  },
});

describe("buildPayload: push", () => {
  it("sends the branch and the commits with the user name when there is one", () => {
    expect(buildPayload("push", pushEvent, env)).toEqual({
      event: "push",
      repository: "smdu-sp/fila-atic",
      branch: "feature/ATC-0001-3-login",
      commits: [
        {
          sha: "aaaaaaa1111111111111111111111111111111111",
          message: "feat: login\n\nCorpo do commit ATC-0001-3",
          author: "fulana",
          url: "https://github.com/smdu-sp/fila-atic/commit/aaaaaaa",
        },
        { sha: "bbbbbbb2222222222222222222222222222222222", message: "fix", author: "Sem Usuario", url: undefined },
      ],
    });
  });

  it("has nothing to tell for tags, deleted branches and pushes without commits", () => {
    expect(buildPayload("push", { ...pushEvent, ref: "refs/tags/v1.0.0" }, env)).toBeNull();
    expect(buildPayload("push", { ...pushEvent, deleted: true }, env)).toBeNull();
    expect(buildPayload("push", { ...pushEvent, commits: [] }, env)).toBeNull();
  });

  it("prefers the commits read from git when the event was cut short", () => {
    const extra = [{ sha: "cccccccc", message: "do git" }];
    const payload = buildPayload("push", pushEvent, env, { extraCommits: extra });
    expect(payload).toMatchObject({ commits: extra });
  });

  it("falls back to GITHUB_REPOSITORY and fails when there is no repository at all", () => {
    expect(buildPayload("push", { ...pushEvent, repository: undefined }, env)).toMatchObject({ repository: "smdu-sp/fila-atic" });
    expect(() => buildPayload("push", { ...pushEvent, repository: undefined }, {})).toThrow(/repositorio/);
  });
});

describe("buildPayload: pull_request", () => {
  it("maps opened, reopened and ready_for_review to opened", () => {
    for (const action of ["opened", "reopened", "ready_for_review"]) {
      expect(buildPayload("pull_request", prEvent(action), env)).toMatchObject({ event: "pull_request", state: "opened", number: 12, branch: "feature/login", author: "fulana" });
    }
  });

  it("tells a merge from a plain close", () => {
    expect(buildPayload("pull_request", prEvent("closed", { merged: true }), env)).toMatchObject({ state: "merged" });
    expect(buildPayload("pull_request", prEvent("closed"), env)).toMatchObject({ state: "closed" });
  });

  it("ignores the actions that change nothing for the board", () => {
    for (const action of ["synchronize", "labeled", "edited", "assigned"]) {
      expect(buildPayload("pull_request", prEvent(action), env)).toBeNull();
    }
    expect(buildPayload("pull_request", {}, env)).toBeNull();
  });
});

describe("buildPayload: deploy and ping", () => {
  it("reports the outcome of the deploy with a link to the run", () => {
    const success = buildPayload("deploy", pushEvent, env, { status: "success", environment: "production" });
    expect(success).toMatchObject({
      event: "deploy",
      branch: "feature/ATC-0001-3-login",
      status: "success",
      environment: "production",
      url: "https://github.com/smdu-sp/fila-atic/actions/runs/42",
    });
    expect(buildPayload("deploy", pushEvent, env, { status: "failure" })).toMatchObject({ status: "failure" });
    // anything that is not exactly "failure" counts as a success
    expect(buildPayload("deploy", pushEvent, env, { status: "?" })).toMatchObject({ status: "success" });
  });

  it("pings with just the repository", () => {
    expect(buildPayload("ping", {}, env)).toEqual({ event: "ping", repository: "smdu-sp/fila-atic" });
  });

  it("refuses an unknown kind", () => {
    // @ts-expect-error on purpose
    expect(() => buildPayload("release", pushEvent, env)).toThrow(/desconhecido/);
  });
});

describe("commitsFromPush", () => {
  it("skips malformed entries", () => {
    expect(commitsFromPush({ commits: [null, { id: "curto", message: "x" }, { id: "abcdef1234", message: "ok" }] })).toEqual([
      { sha: "abcdef1234", message: "ok", author: undefined, url: undefined },
    ]);
    expect(commitsFromPush({})).toEqual([]);
  });
});

describe("send", () => {
  const options = { url: "http://fila.interno:3003/", token: "segredo", waitMs: 0 };
  const answer = (status: number, body = "{}") => vi.fn(async () => new Response(body, { status }));

  it("posts JSON to the integration endpoint with the bearer token", async () => {
    const fetchImpl = answer(200, '{"ok":true}');
    const text = await send({ event: "ping", repository: "a/b" }, { ...options, fetchImpl: fetchImpl as never });

    expect(text).toBe('{"ok":true}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://fila.interno:3003/api/integrations/github");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer segredo");
    expect(JSON.parse(init.body as string)).toEqual({ event: "ping", repository: "a/b" });
  });

  it("retries server errors and network failures, then gives up", async () => {
    const flaky = vi
      .fn()
      .mockResolvedValueOnce(new Response("erro", { status: 502 }))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await expect(send({}, { ...options, fetchImpl: flaky as never })).resolves.toBe("{}");
    expect(flaky).toHaveBeenCalledTimes(3);

    const down = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(send({}, { ...options, fetchImpl: down as never })).rejects.toThrow("ECONNREFUSED");
    expect(down).toHaveBeenCalledTimes(3);
  });

  it("does not retry a refusal from the server (wrong token, disabled, bad payload)", async () => {
    for (const status of [400, 401, 403]) {
      const refused = answer(status, '{"error":"nao"}');
      await expect(send({}, { ...options, fetchImpl: refused as never })).rejects.toThrow(`HTTP ${status}`);
      expect(refused).toHaveBeenCalledTimes(1);
    }
  });
});
