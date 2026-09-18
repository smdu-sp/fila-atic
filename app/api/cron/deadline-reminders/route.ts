import { timingSafeEqual } from "crypto";

import { runDeadlineReminders } from "@/lib/deadlineReminders";

// Called once a day by the server's scheduler (see README). It has no session:
// the only credential is the CRON_SECRET bearer token. Without CRON_SECRET the
// route is disabled, so it can never be triggered by accident.
export const dynamic = "force-dynamic";

function isAuthorized(request: Request, secret: string) {
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);

  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET nao configurado" }, { status: 503 });
  }

  if (!isAuthorized(request, secret)) {
    return Response.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const result = await runDeadlineReminders();
  return Response.json({ ok: true, ...result });
}

// Some schedulers can only issue GET. The job is idempotent, so this is safe.
export const GET = POST;
