#!/usr/bin/env node
// Deploys one commit of Fila ATIC on the server where this script runs (the
// machine of the self-hosted GitHub runner). Called by the "Deploy" workflow;
// can also be run by hand on the server. See docs/github-runner.md.
//
//   node scripts/deploy.mjs --sha <commit> [--commits-file deploy-commits.json]
//
// The application lives in its own git clone (FILA_ATIC_APP_DIR, with its
// .env). A deploy is: check out the commit there, install, back up (optional),
// apply migrations, build, restart, and wait for the app to answer. If the app
// does not come back, the previous commit is built and started again.
//
// Settings (environment):
//   FILA_ATIC_APP_DIR      folder of the deployed clone (required)
//   FILA_ATIC_RESTART_CMD  command that restarts the app (required), e.g.
//                          "sudo systemctl restart fila-atic"
//   FILA_ATIC_HEALTH_URL   address that answers 200 when the app is up
//                          (default http://localhost:3003/login)
//   FILA_ATIC_BACKUP_CMD   optional, run before the migrations, e.g. a pg_dump
//   FILA_ATIC_HEALTH_WAIT  seconds to wait for the app to come back (default 90)
//
// Migrations are NOT rolled back on failure (the database keeps moving
// forward), so they must stay compatible with the previous version of the code
// for one release; that is what makes the rollback safe. The backup is the net.

import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{7,40}$/i;

export function readConfig(env) {
  const appDir = env.FILA_ATIC_APP_DIR;
  const restart = env.FILA_ATIC_RESTART_CMD;
  const problems = [];

  if (!appDir) problems.push("defina FILA_ATIC_APP_DIR");
  else if (!existsSync(join(appDir, ".git"))) problems.push(`${appDir} não é um clone git`);
  if (!restart) problems.push("defina FILA_ATIC_RESTART_CMD");

  if (problems.length) throw new Error(problems.join("; "));

  return {
    appDir,
    restart,
    backup: env.FILA_ATIC_BACKUP_CMD || null,
    healthUrl: env.FILA_ATIC_HEALTH_URL || "http://localhost:3003/login",
    healthWaitSeconds: Number(env.FILA_ATIC_HEALTH_WAIT || 90),
  };
}

/** Polls the address until it answers with a success status, or the time is up. */
export async function waitForHealth({ url, seconds, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), intervalMs = 3000 }) {
  const deadline = Date.now() + seconds * 1000;

  for (;;) {
    try {
      const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
      // /login answers 200; a redirect to it also means the app is alive
      if (response.status < 400) return true;
    } catch {
      // not up yet
    }
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs);
  }
}

/**
 * The deploy itself. `run(command, options)` executes a shell command and
 * returns its output (throws on failure); tests replace it.
 */
export async function deploy({ config, sha, run, health, log = console.log }) {
  if (!SHA.test(sha)) throw new Error(`commit invalido: ${sha}`);

  const inApp = (command) => run(command, { cwd: config.appDir });
  const step = (name) => log(`\n==> ${name}`);
  const previous = inApp("git rev-parse HEAD").trim();

  const build = () => {
    step("Instalando dependências (npm ci)");
    inApp("npm ci");
    step("Aplicando migrations do banco");
    inApp("npx prisma migrate deploy");
    step("Gerando o client do Prisma");
    inApp("npx prisma generate");
    step("Compilando (npm run build)");
    inApp("npm run build");
    step("Reiniciando o serviço");
    inApp(config.restart);
  };

  step(`Atualizando o código para ${sha.slice(0, 7)} (antes: ${previous.slice(0, 7)})`);
  inApp("git fetch origin --prune");
  inApp(`git checkout --force ${sha}`);

  if (config.backup) {
    step("Backup do banco");
    inApp(config.backup);
  }

  try {
    build();
    step(`Esperando o sistema responder em ${config.healthUrl}`);
    if (!(await health())) throw new Error("o sistema não voltou a responder a tempo");
  } catch (error) {
    log(`\n!! Falha no deploy: ${error.message}`);

    // main() needs both ends to tell GitHub which commits failed to deploy
    Object.assign(error, { previous, sha });
    if (previous === sha) throw error;

    log(`!! Voltando para ${previous.slice(0, 7)}`);
    try {
      inApp(`git checkout --force ${previous}`);
      inApp("npm ci");
      inApp("npx prisma generate");
      inApp("npm run build");
      inApp(config.restart);
      log("!! Versão anterior restaurada (as migrations não são desfeitas).");
    } catch (rollbackError) {
      log(`!! O retorno também falhou: ${rollbackError.message}. Intervenção manual necessária.`);
    }
    throw error;
  }

  step("Deploy concluído");
  return { previous, deployed: sha };
}

/** Commits between two revisions of the deployed clone, for the GitHub notification. */
export function commitsBetween({ appDir, from, to, run }) {
  const range = from && from !== to ? `${from}..${to}` : `-1 ${to}`;
  const output = run(`git log --max-count=200 --format=%H%x1f%an%x1f%B%x1e ${range}`, { cwd: appDir });

  return output
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, author, ...message] = entry.split("\x1f");
      return { sha, author, message: message.join("\x1f").trim() };
    });
}

function shell(command, { cwd } = {}) {
  const result = spawnSync(command, { cwd, shell: true, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 });
  if (result.stdout) process.stdout.write(result.stdout.length > 4000 ? `${result.stdout.slice(0, 4000)}\n[...]\n` : result.stdout);
  if (result.status !== 0) throw new Error(`"${command}" terminou com código ${result.status}`);
  return result.stdout ?? "";
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === "--sha") args.sha = argv[i + 1];
    else if (argv[i] === "--commits-file") args.commitsFile = argv[i + 1];
    else throw new Error(`opcao desconhecida: ${argv[i]}`);
  }
  return args;
}

async function main() {
  let args;
  let config;
  try {
    args = parseArgs(process.argv.slice(2));
    args.sha ??= process.env.GITHUB_SHA;
    if (!args.sha) throw new Error("informe --sha <commit>");
    config = readConfig(process.env);
  } catch (error) {
    console.error(`Uso: node scripts/deploy.mjs --sha <commit> [--commits-file arquivo.json]\n${error.message}`);
    process.exit(2);
  }

  // what the notification step tells Fila ATIC about: the commits new in this
  // deploy, written whether it worked or not
  const writeCommits = ({ previous, sha }) => {
    if (!args.commitsFile || !previous) return;
    try {
      const commits = commitsBetween({ appDir: config.appDir, from: previous, to: sha, run: shell });
      writeFileSync(args.commitsFile, JSON.stringify(commits));
    } catch (error) {
      console.warn(`Não foi possível listar os commits do deploy: ${error.message}`);
    }
  };

  try {
    const result = await deploy({
      config,
      sha: args.sha,
      run: shell,
      health: () => waitForHealth({ url: config.healthUrl, seconds: config.healthWaitSeconds }),
    });
    writeCommits({ previous: result.previous, sha: result.deployed });
  } catch (error) {
    console.error(`\nDeploy falhou: ${error.message}`);
    writeCommits({ previous: error.previous, sha: args.sha });
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
