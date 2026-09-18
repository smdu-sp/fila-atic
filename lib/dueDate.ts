// Due dates are calendar dates, not moments. They are stored in DATE columns,
// travel as "YYYY-MM-DD" strings in forms and actions, and come back from the
// database as a Date at UTC midnight. Every conversion here stays in UTC so a
// date never moves to the day before/after; only "today" depends on the
// organisation's time zone.

export const APP_TIME_ZONE = "America/Sao_Paulo";
export const DUE_SOON_DAYS = 3;

const DAY_MS = 86_400_000;

export type ParsedDate =
  | { ok: true; value: Date | null | undefined }
  | { ok: false };

// undefined = leave untouched, null or "" = clear, "YYYY-MM-DD" = set.
export function parseDateInput(value: unknown): ParsedDate {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false };
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  // rejects impossible days such as 2026-02-31 (they roll over)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { ok: false };
  }

  const year = date.getUTCFullYear();
  if (year < 2000 || year > 2100) return { ok: false };

  return { ok: true, value: date };
}

export const toDateInput = (date: Date | string | null | undefined) =>
  date ? new Date(date).toISOString().slice(0, 10) : "";

export const formatDueDate = (date: Date | string) =>
  new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });

// Today's date in the organisation's time zone, as UTC midnight.
export function todayInAppZone(now: Date = new Date()): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
  }).format(now);

  return new Date(`${iso}T00:00:00.000Z`);
}

export type DueKind = "none" | "overdue" | "today" | "soon" | "upcoming";
export type DueState = { kind: DueKind; days: number };

// days: how many days late (overdue) or left (otherwise). Finished or
// cancelled work is never late.
export function dueState(
  dueDate: Date | string | null | undefined,
  options: { closed?: boolean; now?: Date } = {},
): DueState {
  if (!dueDate || options.closed) return { kind: "none", days: 0 };

  const diff = Math.round(
    (new Date(dueDate).getTime() - todayInAppZone(options.now).getTime()) /
      DAY_MS,
  );

  if (diff < 0) return { kind: "overdue", days: -diff };
  if (diff === 0) return { kind: "today", days: 0 };
  if (diff <= DUE_SOON_DAYS) return { kind: "soon", days: diff };
  return { kind: "upcoming", days: diff };
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function describeDue(
  state: DueState,
  dueDate: Date | string,
): { text: string; tone: "danger" | "warning" | "muted" } {
  switch (state.kind) {
    case "overdue":
      return {
        text: `Atrasado há ${plural(state.days, "dia", "dias")}`,
        tone: "danger",
      };
    case "today":
      return { text: "Vence hoje", tone: "warning" };
    case "soon":
      return {
        text:
          state.days === 1
            ? "Vence amanhã"
            : `Vence em ${plural(state.days, "dia", "dias")}`,
        tone: "warning",
      };
    default:
      return { text: `Previsão ${formatDueDate(dueDate)}`, tone: "muted" };
  }
}
