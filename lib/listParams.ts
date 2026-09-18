// Helpers for list pages driven by URL search params (?q=...&page=2).

export const PAGE_SIZE = 20;

type Raw = string | string[] | undefined;

export const firstParam = (value: Raw) =>
  (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

export function parsePage(value: Raw) {
  const page = Number.parseInt(firstParam(value) ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

// Only accepts values from a known list, so a tampered URL cannot reach the
// query builder.
export function oneOf<T extends string>(
  value: Raw,
  allowed: readonly T[],
): T | undefined {
  const found = firstParam(value);
  return allowed.find((option) => option === found);
}

export const pageCount = (total: number, size = PAGE_SIZE) =>
  Math.max(1, Math.ceil(total / size));

// "YYYY-MM-DD" bounds in the organisation's time zone (UTC-3, no daylight
// saving), as [start of `from`, start of the day after `to`).
export function dayRange(from?: string, to?: string) {
  const valid = (value?: string) =>
    value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;

  const start = valid(from)
    ? new Date(`${valid(from)}T00:00:00-03:00`)
    : undefined;
  const end = valid(to)
    ? new Date(new Date(`${valid(to)}T00:00:00-03:00`).getTime() + 86_400_000)
    : undefined;

  return {
    gte: start && !Number.isNaN(start.getTime()) ? start : undefined,
    lt: end && !Number.isNaN(end.getTime()) ? end : undefined,
  };
}

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
