import type { ProjectStatus } from "@prisma/client";

// Pure computation for the "average time per stage" indicator, so it can be
// tested without a database. The caller fetches the raw history and the
// period boundaries; this only does the math.

export type StatusChangeEvent = {
  projectId: string;
  toStatus: ProjectStatus;
  createdAt: Date;
};

const DAY_MS = 86_400_000;

// Average days spent in each status, counting only spans that both started
// and ended: a project still sitting in a status has not finished that span
// yet, so it is left out rather than biasing the average downward. A span
// counts when it STARTED inside [from, to) (both ends optional).
export function averageDaysInStatus(
  events: StatusChangeEvent[],
  period: { from?: Date; to?: Date } = {},
): Partial<Record<ProjectStatus, number>> {
  const byProject = new Map<string, StatusChangeEvent[]>();
  for (const event of events) {
    const list = byProject.get(event.projectId);
    if (list) list.push(event);
    else byProject.set(event.projectId, [event]);
  }

  const totals = new Map<ProjectStatus, { days: number; count: number }>();

  for (const list of byProject.values()) {
    const sorted = [...list].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const start = sorted[i];
      const end = sorted[i + 1];
      if (period.from && start.createdAt < period.from) continue;
      if (period.to && start.createdAt >= period.to) continue;

      const days =
        (end.createdAt.getTime() - start.createdAt.getTime()) / DAY_MS;
      const bucket = totals.get(start.toStatus) ?? { days: 0, count: 0 };
      bucket.days += days;
      bucket.count += 1;
      totals.set(start.toStatus, bucket);
    }
  }

  const result: Partial<Record<ProjectStatus, number>> = {};
  for (const [status, { days, count }] of totals) {
    result[status] = Math.round((days / count) * 10) / 10;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Timeline: how many requests were opened and finished per week (or per month
// when the period is long), for the line charts.

export type TimelineBucket = {
  // first day of the bucket, "YYYY-MM-DD"
  start: string;
  // short text for the chart axis ("15/09" for weeks, "set/26" for months)
  label: string;
  created: number;
  finished: number;
};

export type Timeline = {
  granularity: "week" | "month";
  buckets: TimelineBucket[];
};

const zoneFormat = (timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone });

// "YYYY-MM-DD" of an instant in the organisation's time zone.
const dayKey = (date: Date, timeZone: string) => zoneFormat(timeZone).format(date);

const parseDay = (key: string) => new Date(`${key}T00:00:00.000Z`);
const toKey = (date: Date) => date.toISOString().slice(0, 10);

// Monday of the week the day belongs to.
function weekStart(key: string): string {
  const date = parseDay(key);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - sinceMonday);
  return toKey(date);
}

const monthStart = (key: string) => `${key.slice(0, 7)}-01`;

const addDays = (key: string, days: number) => {
  const date = parseDay(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
};

const nextMonth = (key: string) => {
  const date = parseDay(key);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return toKey(date);
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const labelFor = (key: string, granularity: "week" | "month") =>
  granularity === "week"
    ? `${key.slice(8, 10)}/${key.slice(5, 7)}`
    : `${MONTHS[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`;

const WEEKS_BY_DEFAULT = 12;
// Beyond this many weeks the chart switches to months, to stay readable.
const MAX_WEEKS = 26;

// `from`/`to` bound the chart (`to` exclusive, like the report filters); with
// no `from` it starts at the oldest event, or WEEKS_BY_DEFAULT weeks ago when
// there is none. Days are counted in `timeZone`.
export function buildTimeline(input: {
  created: Date[];
  finished: Date[];
  from?: Date;
  to?: Date;
  now?: Date;
  timeZone?: string;
}): Timeline {
  const timeZone = input.timeZone ?? "America/Sao_Paulo";
  const now = input.now ?? new Date();
  const today = dayKey(now, timeZone);

  const createdDays = input.created.map((date) => dayKey(date, timeZone));
  const finishedDays = input.finished.map((date) => dayKey(date, timeZone));

  const endKey = input.to ? addDays(dayKey(input.to, timeZone), -1) : today;
  const oldest = [...createdDays, ...finishedDays].sort()[0];
  const startKey = input.from
    ? dayKey(input.from, timeZone)
    : (oldest ?? addDays(today, -7 * WEEKS_BY_DEFAULT));

  const first = startKey <= endKey ? startKey : endKey;
  const spanWeeks = Math.ceil(
    (parseDay(endKey).getTime() - parseDay(first).getTime()) / (7 * 86_400_000),
  );
  const granularity = spanWeeks > MAX_WEEKS ? "month" : "week";
  const bucketOf = granularity === "week" ? weekStart : monthStart;
  const step = granularity === "week" ? (key: string) => addDays(key, 7) : nextMonth;

  const buckets: TimelineBucket[] = [];
  const index = new Map<string, TimelineBucket>();
  for (let key = bucketOf(first); key <= endKey; key = step(key)) {
    const bucket = { start: key, label: labelFor(key, granularity), created: 0, finished: 0 };
    buckets.push(bucket);
    index.set(key, bucket);
  }

  const count = (days: string[], field: "created" | "finished") => {
    for (const day of days) {
      if (day < first || day > endKey) continue;
      const bucket = index.get(bucketOf(day));
      if (bucket) bucket[field] += 1;
    }
  };
  count(createdDays, "created");
  count(finishedDays, "finished");

  return { granularity, buckets };
}
