import { describe, expect, it } from "vitest";
import { ProjectStatus } from "@prisma/client";

import { averageDaysInStatus, type StatusChangeEvent } from "@/lib/reports";

const day = (n: number) => new Date(2026, 0, n);

const event = (
  projectId: string,
  toStatus: ProjectStatus,
  createdAt: Date,
): StatusChangeEvent => ({ projectId, toStatus, createdAt });

describe("averageDaysInStatus", () => {
  it("averages completed spans per status across projects", () => {
    const events: StatusChangeEvent[] = [
      // project A: 2 days in queue, then 4 days in analysis, still open
      event("A", ProjectStatus.IN_QUEUE, day(1)),
      event("A", ProjectStatus.IN_ANALYSIS, day(3)),
      event("A", ProjectStatus.IN_DEVELOPMENT, day(7)),
      // project B: 4 days in queue
      event("B", ProjectStatus.IN_QUEUE, day(1)),
      event("B", ProjectStatus.IN_ANALYSIS, day(5)),
    ];

    expect(averageDaysInStatus(events)).toEqual({
      [ProjectStatus.IN_QUEUE]: 3, // (2 + 4) / 2
      [ProjectStatus.IN_ANALYSIS]: 4, // only A's completed (B's is still open)
    });
  });

  it("leaves out the span a project has not left yet", () => {
    const events: StatusChangeEvent[] = [
      event("A", ProjectStatus.IN_QUEUE, day(1)),
      event("A", ProjectStatus.IN_ANALYSIS, day(4)), // still here, no next event
    ];

    // IN_QUEUE finished (3 days); IN_ANALYSIS never ended, so it is absent
    expect(averageDaysInStatus(events)).toEqual({
      [ProjectStatus.IN_QUEUE]: 3,
    });
  });

  it("only counts a span whose start falls inside the period", () => {
    const events: StatusChangeEvent[] = [
      event("A", ProjectStatus.IN_QUEUE, day(1)),
      event("A", ProjectStatus.IN_ANALYSIS, day(3)), // started day 1: before the period
      event("A", ProjectStatus.IN_DEVELOPMENT, day(10)), // started day 3: still before
      event("B", ProjectStatus.IN_QUEUE, day(6)),
      event("B", ProjectStatus.IN_ANALYSIS, day(8)), // started day 6: inside the period
    ];

    expect(averageDaysInStatus(events, { from: day(5), to: day(9) })).toEqual({
      [ProjectStatus.IN_QUEUE]: 2,
    });
  });

  it("handles an empty history", () => {
    expect(averageDaysInStatus([])).toEqual({});
  });

  it("sorts out-of-order events by time before pairing them up", () => {
    const events: StatusChangeEvent[] = [
      event("A", ProjectStatus.IN_ANALYSIS, day(5)),
      event("A", ProjectStatus.IN_QUEUE, day(1)),
    ];

    expect(averageDaysInStatus(events)).toEqual({
      [ProjectStatus.IN_QUEUE]: 4,
    });
  });
});
