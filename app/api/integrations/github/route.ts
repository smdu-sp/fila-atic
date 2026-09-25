import { timingSafeEqual } from "crypto";

import { githubPayloadSchema } from "@/lib/githubPayload";
import { getGithubSettings, processGithubPayload } from "@/lib/githubSync";

// Called by the GitHub Actions workflows that run on the server's self-hosted
// runner (see docs/github-runner.md and scripts/github-notify.mjs). It has no
// session: the credential is the GITHUB_INTEGRATION_TOKEN bearer token, and
// without it the route is off. The server is not reachable from the internet,
// which is why the runner (an outbound connection to GitHub) does the calling
// instead of GitHub calling a webhook.
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2 * 1024 * 1024;

function isAuthorized(request: Request, secret: string) {
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);

  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function POST(request: Request) {
  const secret = process.env.GITHUB_INTEGRATION_TOKEN;
  if (!secret) {
    return Response.json({ error: "GITHUB_INTEGRATION_TOKEN nao configurado" }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return Response.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const settings = await getGithubSettings();
  if (!settings.enabled) {
    return Response.json({ error: "Integracao desativada" }, { status: 403 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return Response.json({ error: "Corpo grande demais" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON invalido" }, { status: 400 });
  }

  const parsed = githubPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Payload invalido",
        issues: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      },
      { status: 400 },
    );
  }

  const result = await processGithubPayload(parsed.data, settings);
  return Response.json({ ok: true, ...result });
}
