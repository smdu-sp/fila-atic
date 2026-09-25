export type DeployConfig = {
  appDir: string;
  restart: string;
  backup: string | null;
  healthUrl: string;
  healthWaitSeconds: number;
};

export type Run = (command: string, options: { cwd: string }) => string;

export function readConfig(env: Record<string, string | undefined>): DeployConfig;

export function waitForHealth(options: {
  url: string;
  seconds: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  intervalMs?: number;
}): Promise<boolean>;

export function deploy(options: {
  config: DeployConfig;
  sha: string;
  run: Run;
  health: () => Promise<boolean>;
  log?: (message: string) => void;
}): Promise<{ previous: string; deployed: string }>;

export function commitsBetween(options: {
  appDir: string;
  from: string | null | undefined;
  to: string;
  run: Run;
}): Array<{ sha: string; author: string; message: string }>;
