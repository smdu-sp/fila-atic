import nodemailer, { type Transporter } from "nodemailer";

import { EMAIL_LOGO_ATTACHMENT } from "@/lib/emailTemplate";
import { prisma } from "@/lib/prisma";
import {
  isRetryableMailError,
  MAX_SEND_ATTEMPTS,
  resolveTransportConfig,
  RETRY_DELAY_MS,
} from "@/lib/mailTransport";

// SMTP settings: SMTP_HOST, SMTP_PORT (default 587), SMTP_SECURE ("true" for
// implicit TLS, usually port 465), SMTP_USER/SMTP_PASS (optional — many
// internal relays accept mail from the app server's IP without a login),
// SMTP_FROM and SMTP_TLS_REJECT_UNAUTHORIZED (see lib/mailTransport.ts).
// Without SMTP_HOST the message is printed to the console outside production,
// so the confirmation flow can be tried locally; in production it throws.
//
// The app server and the mail relay are two different machines (the relay is
// the one actually allowed to hand mail to the outside world); this only
// needs an outbound connection to it, the same shape as the GitHub runner
// only needing an outbound connection to GitHub. See the README's "E-mail"
// section for what to configure on each side.

type Mail = {
  to: string;
  subject: string;
  // Plain-text body; always required, sent as-is and used for the dev
  // console fallback. `html` (build both with lib/emailTemplate.ts's
  // renderEmail) makes the message multipart/alternative — most clients show
  // it and fall back to `text` themselves when they can't render HTML.
  text: string;
  html?: string;
  // What this message is, for Administração > E-mail's log. Callers that
  // don't pass one (there should be none left) show up as "other".
  kind?: string;
};

let cached: Transporter | null | undefined;

// Built once and reused: SMTP_* never changes while the process is running,
// and reusing the connection (pool: true) matters when the deadline-reminder
// job sends many messages in one run.
function transport(): Transporter | null {
  if (cached !== undefined) return cached;

  const config = resolveTransportConfig(process.env);
  cached = config
    ? nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
        tls: { rejectUnauthorized: config.rejectUnauthorized },
        pool: true,
        maxConnections: 3,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      })
    : null;

  return cached;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function log(entry: {
  kind: string;
  to: string;
  subject: string;
  status: "sent" | "skipped" | "failed";
  attempts: number;
  error?: string;
}) {
  try {
    await prisma.mailLog.create({ data: entry });
  } catch (error) {
    // Administração > E-mail losing one row is not worth failing the send
    // (or the notification that triggered it) over.
    console.error("Falha ao registrar MailLog", error);
  }
}

export async function sendMail({ to, subject, text, html, kind = "other" }: Mail) {
  const client = transport();

  if (!client) {
    if (process.env.NODE_ENV === "production") {
      await log({ kind, to, subject, status: "failed", attempts: 0, error: "SMTP nao configurado" });
      throw new Error("SMTP nao configurado");
    }

    console.info(`[mail:dev] To: ${to}\nSubject: ${subject}\n\n${text}`);
    await log({ kind, to, subject, status: "skipped", attempts: 0 });
    return;
  }

  const config = resolveTransportConfig(process.env);
  let lastError: unknown;
  let attempt = 0;

  for (attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      await client.sendMail({
        from: config?.from,
        to,
        subject,
        text,
        html,
        // the brand mark every renderEmail() html references as cid:...;
        // harmless (and unused) on a plain-text send
        attachments: html ? [EMAIL_LOGO_ATTACHMENT] : undefined,
      });
      await log({ kind, to, subject, status: "sent", attempts: attempt });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableMailError(error) || attempt === MAX_SEND_ATTEMPTS) break;
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  await log({
    kind,
    to,
    subject,
    status: "failed",
    // how many tries it actually took: 1 for a permanent rejection (no point
    // retrying), up to MAX_SEND_ATTEMPTS for one that kept timing out
    attempts: attempt,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw lastError;
}
