import { ProjectStatus } from "@prisma/client";

// Pure rules about what a requester may do with their own request. Kept apart
// from lib/requestLifecycle.ts (which talks to the database) so client
// components can use them too.

export const REOPEN_WINDOW_DAYS = 30;
export const MIN_REASON_LENGTH = 5;
export const MAX_REASON_LENGTH = 1000;

// After a project starts being developed only the team can cancel it.
export const REQUESTER_CANCELABLE: ProjectStatus[] = [
  ProjectStatus.IN_QUEUE,
  ProjectStatus.IN_ANALYSIS,
];

export const REOPENABLE: ProjectStatus[] = [
  ProjectStatus.FINISHED,
  ProjectStatus.CANCELED,
];

// Returns the trimmed reason, or null when it is missing or out of range.
export function normalizeReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim();
  return trimmed.length >= MIN_REASON_LENGTH &&
    trimmed.length <= MAX_REASON_LENGTH
    ? trimmed
    : null;
}

export const REASON_ERROR = `Informe o motivo (de ${MIN_REASON_LENGTH} a ${MAX_REASON_LENGTH} caracteres)`;
