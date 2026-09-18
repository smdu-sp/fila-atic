import { createHash, createHmac, randomBytes } from "crypto";
import { headers } from "next/headers";

import { prisma } from "@/lib/prisma";

// Public request form (no account). Configuration lives in the environment:
// - PUBLIC_REQUEST_ALLOWED_DOMAINS: comma-separated e-mail domains allowed to
//   open requests (e.g. "prefeitura.sp.gov.br"). Empty disables the feature.
// - NEXTAUTH_URL: base URL used in the links sent by e-mail.

export const CONFIRM_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_PENDING_PER_EMAIL = 3;

const HOUR_MS = 60 * 60 * 1000;

export const RATE_LIMITS = {
  submitIp: { kind: "submit-ip", limit: 10, windowMs: HOUR_MS },
  submitEmail: { kind: "submit-email", limit: 3, windowMs: HOUR_MS },
  // Caps the damage when X-Forwarded-For is spoofed (no trusted proxy).
  submitGlobal: { kind: "submit-global", limit: 200, windowMs: HOUR_MS },
  reply: { kind: "guest-reply", limit: 20, windowMs: HOUR_MS },
  // cancel / reopen through the tracking link
  lifecycle: { kind: "guest-lifecycle", limit: 10, windowMs: HOUR_MS },
  // "send me my links again": e-mails go to whoever owns the mailbox, so the
  // limits protect that person from being flooded
  resendEmail: { kind: "resend-email", limit: 3, windowMs: HOUR_MS },
  resendIp: { kind: "resend-ip", limit: 10, windowMs: HOUR_MS },
  resendGlobal: { kind: "resend-global", limit: 100, windowMs: HOUR_MS },
} as const;

export function getAllowedEmailDomains() {
  return (process.env.PUBLIC_REQUEST_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isPublicRequestEnabled() {
  return getAllowedEmailDomains().length > 0;
}

export function isAllowedEmail(email: string) {
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return getAllowedEmailDomains().includes(domain);
}

export function getAppUrl() {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3003").replace(
    /\/+$/,
    "",
  );
}

export function generateToken() {
  return randomBytes(32).toString("base64url");
}

export function isValidTokenFormat(token: string) {
  return /^[A-Za-z0-9_-]{30,64}$/.test(token);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hmac(value: string) {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "fila-atic")
    .update(value)
    .digest("hex")
    .slice(0, 32);
}

// Only a keyed hash of the address is stored, never the IP itself.
export async function getClientKey() {
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  return hmac(ip);
}

export function keyFor(value: string) {
  return hmac(value.trim().toLowerCase());
}

// Records the attempt and returns false when the limit for the window is
// already reached. Not atomic; good enough to stop bulk abuse.
export async function consumeAttempt(
  rule: { kind: string; limit: number; windowMs: number },
  key: string,
) {
  const since = new Date(Date.now() - rule.windowMs);
  const used = await prisma.publicRequestAttempt.count({
    where: { kind: rule.kind, key, createdAt: { gte: since } },
  });

  if (used >= rule.limit) return false;

  await prisma.publicRequestAttempt.create({ data: { kind: rule.kind, key } });

  if (Math.random() < 0.05) {
    await prisma.publicRequestAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * HOUR_MS) } },
    });
  }

  return true;
}
