import { z } from "zod";

// What the workflows send to /api/integrations/github (built by
// scripts/github-notify.mjs from the GitHub event). Deliberately our own small
// format and not GitHub's raw webhook body, so the server does not depend on
// GitHub's payload details and the script is the only place that knows them.

const repository = z.string().regex(/^[\w.-]+\/[\w.-]+$/, "repositorio invalido");
const branch = z.string().min(1).max(250);

const commit = z.object({
  sha: z.string().min(7).max(64),
  message: z.string().max(20000),
  author: z.string().max(200).optional(),
  url: z.string().max(500).optional(),
});

export const githubPayloadSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("ping"), repository }),
  z.object({
    event: z.literal("push"),
    repository,
    branch,
    commits: z.array(commit).max(200),
  }),
  z.object({
    event: z.literal("pull_request"),
    repository,
    state: z.enum(["opened", "merged", "closed"]),
    number: z.number().int().positive(),
    title: z.string().max(1000),
    body: z.string().max(20000).optional(),
    branch,
    author: z.string().max(200).optional(),
    url: z.string().max(500).optional(),
  }),
  z.object({
    event: z.literal("deploy"),
    repository,
    branch,
    status: z.enum(["success", "failure"]),
    environment: z.string().max(100).optional(),
    url: z.string().max(500).optional(),
    commits: z.array(commit).max(200),
  }),
]);

export type GithubPayload = z.infer<typeof githubPayloadSchema>;
