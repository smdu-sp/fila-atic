import { describe, expect, it } from "vitest";

import { buildTimeline } from "@/lib/reports";

const at = (iso: string) => new Date(`${iso}T15:00:00.000Z`);
const now = at("2026-09-24"); // a Thursday

describe("buildTimeline", () => {
  it("makes contiguous weekly buckets starting on Monday, empty ones included", () => {
    const { granularity, buckets } = buildTimeline({
      created: [at("2026-09-01"), at("2026-09-02"), at("2026-09-22")],
      finished: [at("2026-09-23")],
      from: at("2026-09-01"),
      now,
    });

    expect(granularity).toBe("week");
    expect(buckets.map((b) => b.start)).toEqual([
      "2026-08-31",
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
    expect(buckets.map((b) => [b.created, b.finished])).toEqual([
      [2, 0],
      [0, 0],
      [0, 0],
      [1, 1],
    ]);
    expect(buckets[0].label).toBe("31/08");
  });

  it("defaults to the last 12 weeks when there is nothing at all", () => {
    const { buckets } = buildTimeline({ created: [], finished: [], now });
    expect(buckets).toHaveLength(13);
    expect(buckets.every((b) => b.created === 0 && b.finished === 0)).toBe(true);
    expect(buckets.at(-1)?.start).toBe("2026-09-21");
  });

  it("starts at the oldest event when no period is given, and switches to months when long", () => {
    const { granularity, buckets } = buildTimeline({
      created: [at("2025-11-10"), at("2026-09-02")],
      finished: [at("2026-01-15")],
      now,
    });

    expect(granularity).toBe("month");
    expect(buckets[0]).toMatchObject({ start: "2025-11-01", label: "nov/25", created: 1 });
    expect(buckets.find((b) => b.start === "2026-01-01")?.finished).toBe(1);
    expect(buckets.at(-1)).toMatchObject({ start: "2026-09-01", created: 1 });
  });

  it("ignores events outside the period and treats `to` as exclusive", () => {
    const { buckets } = buildTimeline({
      created: [at("2026-08-01"), at("2026-09-10"), at("2026-09-15")],
      finished: [],
      from: at("2026-09-07"),
      to: at("2026-09-14"),
      now,
    });

    expect(buckets.map((b) => b.start)).toEqual(["2026-09-07"]);
    expect(buckets[0].created).toBe(1);
  });

  it("counts the day in the organisation's time zone, not in UTC", () => {
    // 01:00 UTC on the 8th is still the 7th (Monday) in São Paulo
    const { buckets } = buildTimeline({
      created: [new Date("2026-09-08T01:00:00.000Z")],
      finished: [],
      from: at("2026-09-07"),
      to: at("2026-09-14"),
      now,
    });
    expect(buckets[0]).toMatchObject({ start: "2026-09-07", created: 1 });
  });
});
