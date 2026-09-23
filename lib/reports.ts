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
