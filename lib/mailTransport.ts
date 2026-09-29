// Pure pieces of the SMTP setup: turning env vars into transport options, and
// deciding whether a failed send is worth retrying. Kept apart from lib/mail.ts
// (which touches the network and the database) so this can be tested without
// either.

export type TransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string | undefined };
  from: string | undefined;
  // Most internal relays (an Exchange/Postfix box on the same network as the
  // app server, reached only by hostname or IP) present a certificate that is
  // self-signed or issued by an internal CA, which Node does not trust by
  // default. SMTP_TLS_REJECT_UNAUTHORIZED="false" turns that check off for
  // this connection only; it still runs over TLS (or STARTTLS), just without
  // validating the certificate chain.
  rejectUnauthorized: boolean;
};

// Env truthiness the rest of the app already uses ("true"/"false" strings).
const isTrue = (value: string | undefined) => value === "true";
const isFalse = (value: string | undefined) => value === "false";

// null when SMTP_HOST is not set: the app has no relay to send through (see
// lib/mail.ts for what that means outside/inside production).
export function resolveTransportConfig(
  env: Record<string, string | undefined>,
): TransportConfig | null {
  const host = env.SMTP_HOST;
  if (!host) return null;

  const user = env.SMTP_USER;

  return {
    host,
    port: Number(env.SMTP_PORT ?? 587),
    secure: isTrue(env.SMTP_SECURE),
    auth: user ? { user, pass: env.SMTP_PASS } : undefined,
    from: env.SMTP_FROM ?? user,
    // default true (verify the certificate); only "false" turns it off, so a
    // typo or an unset variable never silently weakens security.
    rejectUnauthorized: !isFalse(env.SMTP_TLS_REJECT_UNAUTHORIZED),
  };
}

export const MAX_SEND_ATTEMPTS = 3;
export const RETRY_DELAY_MS = 1000;

// An SMTP-level rejection in the 5xx range (e.g. 550 mailbox unavailable, 553
// bad address) is the server telling us this exact message will never go
// through: retrying only delays the failure. A 4xx (mailbox temporarily
// full, greylisting) or a connection-level error (refused, timeout, no
// responseCode at all) is worth another attempt.
export function isRetryableMailError(error: unknown): boolean {
  const code = (error as { responseCode?: number })?.responseCode;
  if (typeof code !== "number") return true;
  return code < 500 || code >= 600;
}
