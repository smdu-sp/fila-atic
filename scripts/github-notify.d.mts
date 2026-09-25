export type NotifyCommit = { sha: string; message: string; author?: string; url?: string };

export function commitsFromPush(event: unknown): NotifyCommit[];

export function buildPayload(
  kind: "push" | "pull_request" | "deploy" | "ping",
  event: unknown,
  env: Record<string, string | undefined>,
  options?: { status?: string; environment?: string; extraCommits?: NotifyCommit[]; branch?: string },
): Record<string, unknown> | null;

export function send(
  payload: unknown,
  options: {
    url: string;
    token: string;
    fetchImpl?: typeof fetch;
    attempts?: number;
    waitMs?: number;
  },
): Promise<string>;
