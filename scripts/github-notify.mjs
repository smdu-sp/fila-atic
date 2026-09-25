#!/usr/bin/env node
// Tells Fila ATIC what happened on GitHub. Runs as a step of a GitHub Actions
// workflow on the server's self-hosted runner (the only place that can reach
// the internal Fila ATIC address), so the server never needs to be reachable
// from the internet. See docs/github-runner.md.
//
//   node scripts/github-notify.mjs push
//   node scripts/github-notify.mjs pull_request
//   node scripts/github-notify.mjs deploy --status success --environment production //        --branch main --commits-file deploy-commits.json
//   node scripts/github-notify.mjs ping
//
// Reads what GitHub gives every workflow (GITHUB_EVENT_PATH, GITHUB_REPOSITORY,
// ...) plus two settings of ours:
//   FILA_ATIC_URL    base address of Fila ATIC, e.g. http://fila-atic.interno:3003
//   FILA_ATIC_TOKEN  the same value as GITHUB_INTEGRATION_TOKEN on the server
//
// Exit codes: 0 delivered (or nothing to tell), 1 could not deliver, 2 bad use.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const MAX_COMMITS = 200;
// GitHub puts at most 20 commits in a push event; beyond that we ask git.
const GITHUB_COMMIT_LIMIT = 20;
const EMPTY_SHA = /^0+$/;

/** @typedef {{ sha: string, message: string, author?: string, url?: string }} Commit */

const branchOf = (ref) => (typeof ref === "string" && ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null);

/** Commits of a push event, in the shape the server expects. */
export function commitsFromPush(event) {
  return (event.commits ?? [])
    .filter((commit) => commit && typeof commit.id === "string" && commit.id.length >= 7)
    .slice(0, MAX_COMMITS)
    .map((commit) => ({
      sha: commit.id,
      message: String(commit.message ?? ""),
      author: commit.author?.username ?? commit.author?.name ?? undefined,
      url: commit.url ?? undefined,
    }));
}

/**
 * The payload for one kind of event, or null when there is nothing to tell
 * (a tag push, a branch deletion, a pull request that only got a new label).
 *
 * @param {"push"|"pull_request"|"deploy"|"ping"} kind
 * @param {any} event    the parsed GITHUB_EVENT_PATH file
 * @param {Record<string, string | undefined>} env
 * @param {{ status?: string, environment?: string, extraCommits?: Commit[], branch?: string }} [options]
 */
export function buildPayload(kind, event, env, options = {}) {
  const repository = event?.repository?.full_name ?? env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("repositorio nao encontrado (GITHUB_REPOSITORY)");

  if (kind === "ping") return { event: "ping", repository };

  if (kind === "push" || kind === "deploy") {
    // a deploy started by "workflow_run" or by hand has no push event: the
    // caller says which branch and which commits
    const branch = options.branch ?? branchOf(event?.ref ?? env.GITHUB_REF);
    if (!branch || event?.deleted) return null;

    const commits = options.extraCommits?.length ? options.extraCommits : commitsFromPush(event);
    if (!commits.length) return null;

    if (kind === "push") return { event: "push", repository, branch, commits };

    const runUrl =
      env.GITHUB_RUN_ID && env.GITHUB_SERVER_URL
        ? `${env.GITHUB_SERVER_URL}/${repository}/actions/runs/${env.GITHUB_RUN_ID}`
        : undefined;

    return {
      event: "deploy",
      repository,
      branch,
      status: options.status === "failure" ? "failure" : "success",
      environment: options.environment,
      url: runUrl,
      commits,
    };
  }

  if (kind === "pull_request") {
    const pr = event?.pull_request;
    if (!pr) return null;

    let state;
    if (["opened", "reopened", "ready_for_review"].includes(event.action)) state = "opened";
    else if (event.action === "closed") state = pr.merged ? "merged" : "closed";
    else return null;

    return {
      event: "pull_request",
      repository,
      state,
      number: pr.number,
      title: String(pr.title ?? ""),
      body: pr.body ?? undefined,
      branch: pr.head?.ref ?? "desconhecida",
      author: pr.user?.login ?? undefined,
      url: pr.html_url ?? undefined,
    };
  }

  throw new Error(`evento desconhecido: ${kind}`);
}

// A push with more commits than GitHub lists in the event: read them from git.
function commitsFromGit(before, after) {
  const output = execFileSync(
    "git",
    ["log", "--format=%H%x1f%an%x1f%B%x1e", `${before}..${after}`, `--max-count=${MAX_COMMITS}`],
    { encoding: "utf8" },
  );

  return output
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, author, ...message] = entry.split("\x1f");
      return { sha, author, message: message.join("\x1f").trim() };
    });
}

/** POSTs the payload, retrying a few times when the server or the network hiccups. */
export async function send(payload, { url, token, fetchImpl = fetch, attempts = 3, waitMs = 2000 }) {
  const endpoint = `${url.replace(/\/+$/, "")}/api/integrations/github`;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });
      const text = await response.text();

      // the server answered: a client error will not get better by retrying
      if (response.status < 500) {
        if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}: ${text}`), { final: true });
        return text;
      }
      lastError = new Error(`HTTP ${response.status}: ${text}`);
    } catch (error) {
      if (error?.final) throw error;
      lastError = error;
    }

    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, waitMs * attempt));
  }

  throw lastError;
}

function parseArgs(argv) {
  const [kind, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (flag === "--status") options.status = rest[i + 1];
    else if (flag === "--environment") options.environment = rest[i + 1];
    else if (flag === "--branch") options.branch = rest[i + 1];
    else if (flag === "--commits-file") options.commitsFile = rest[i + 1];
    else throw new Error(`opcao desconhecida: ${flag}`);
  }
  return { kind, options };
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
    if (!["push", "pull_request", "deploy", "ping"].includes(parsed.kind)) throw new Error("informe: push | pull_request | deploy | ping");
  } catch (error) {
    console.error(`Uso: node scripts/github-notify.mjs <push|pull_request|deploy|ping> [--status success|failure] [--environment nome] [--branch nome] [--commits-file arquivo.json]\n${error.message}`);
    process.exit(2);
  }

  const { FILA_ATIC_URL: url, FILA_ATIC_TOKEN: token, GITHUB_EVENT_PATH: eventPath } = process.env;
  if (!url || !token) {
    console.error("Defina FILA_ATIC_URL e FILA_ATIC_TOKEN (variável e segredo do repositório no GitHub).");
    process.exit(2);
  }

  const event = eventPath ? JSON.parse(readFileSync(eventPath, "utf8")) : {};

  let extraCommits;
  if (parsed.options.commitsFile) {
    // written by scripts/deploy.mjs; missing means the deploy never got that far
    try {
      extraCommits = JSON.parse(readFileSync(parsed.options.commitsFile, "utf8"));
    } catch {
      console.log("Sem lista de commits do deploy; nada a informar.");
      return;
    }
  }
  const many = (event.commits ?? []).length >= GITHUB_COMMIT_LIMIT;
  if (!extraCommits && (parsed.kind === "push" || parsed.kind === "deploy") && many && event.before && !EMPTY_SHA.test(event.before)) {
    try {
      extraCommits = commitsFromGit(event.before, event.after);
    } catch (error) {
      console.warn(`Não foi possível ler os commits no git (${error.message}); usando os do evento.`);
    }
  }

  const payload = buildPayload(parsed.kind, event, process.env, { ...parsed.options, extraCommits });
  if (!payload) {
    console.log("Nada a informar ao Fila ATIC para este evento.");
    return;
  }

  try {
    const answer = await send(payload, { url, token });
    console.log(`Fila ATIC respondeu: ${answer}`);
  } catch (error) {
    console.error(`Não foi possível avisar o Fila ATIC: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
