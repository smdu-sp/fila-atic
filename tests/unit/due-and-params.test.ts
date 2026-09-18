import { describe, expect, it } from "vitest";

import {
  describeDue,
  dueState,
  formatDueDate,
  parseDateInput,
  todayInAppZone,
  toDateInput,
} from "@/lib/dueDate";
import { dayRange, firstParam, oneOf, pageCount, parsePage } from "@/lib/listParams";

describe("parseDateInput", () => {
  it("distinguishes untouched, cleared and set", () => {
    expect(parseDateInput(undefined)).toEqual({ ok: true, value: undefined });
    expect(parseDateInput(null)).toEqual({ ok: true, value: null });
    expect(parseDateInput("")).toEqual({ ok: true, value: null });
    expect(parseDateInput("2026-10-05")).toEqual({
      ok: true,
      value: new Date("2026-10-05T00:00:00.000Z"),
    });
  });

  it("rejects malformed and impossible dates", () => {
    for (const bad of ["05/10/2026", "2026-13-01", "2026-02-31", "amanha", 20261005, "1999-01-01", "2101-01-01"]) {
      expect(parseDateInput(bad)).toEqual({ ok: false });
    }
  });

  it("round-trips through the input format without shifting the day", () => {
    const parsed = parseDateInput("2026-12-31");
    expect(parsed.ok && toDateInput(parsed.value)).toBe("2026-12-31");
    expect(formatDueDate(new Date("2026-12-31T00:00:00.000Z"))).toBe("31/12/2026");
    expect(toDateInput(null)).toBe("");
  });
});

describe("today in the organisation's time zone", () => {
  it("is still the previous day at 01:00 UTC (22:00 in São Paulo)", () => {
    expect(todayInAppZone(new Date("2026-10-06T01:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(todayInAppZone(new Date("2026-10-06T03:30:00Z")).toISOString().slice(0, 10)).toBe("2026-10-06");
  });
});

describe("dueState", () => {
  const now = new Date("2026-10-05T15:00:00Z"); // 12:00 in São Paulo

  it("classifies by distance to today", () => {
    expect(dueState("2026-10-03", { now })).toEqual({ kind: "overdue", days: 2 });
    expect(dueState("2026-10-05", { now })).toEqual({ kind: "today", days: 0 });
    expect(dueState("2026-10-06", { now })).toEqual({ kind: "soon", days: 1 });
    expect(dueState("2026-10-08", { now })).toEqual({ kind: "soon", days: 3 });
    expect(dueState("2026-10-09", { now })).toEqual({ kind: "upcoming", days: 4 });
  });

  it("never marks finished work or a missing date as late", () => {
    expect(dueState("2026-01-01", { now, closed: true }).kind).toBe("none");
    expect(dueState(null, { now }).kind).toBe("none");
  });

  it("describes each state in Portuguese", () => {
    const date = new Date("2026-10-03T00:00:00Z");
    expect(describeDue({ kind: "overdue", days: 2 }, date).text).toBe("Atrasado há 2 dias");
    expect(describeDue({ kind: "overdue", days: 1 }, date).text).toBe("Atrasado há 1 dia");
    expect(describeDue({ kind: "today", days: 0 }, date).tone).toBe("warning");
    expect(describeDue({ kind: "soon", days: 1 }, date).text).toBe("Vence amanhã");
    expect(describeDue({ kind: "soon", days: 3 }, date).text).toBe("Vence em 3 dias");
    expect(describeDue({ kind: "upcoming", days: 9 }, date).text).toBe("Previsão 03/10/2026");
  });
});

describe("list params", () => {
  it("parses pages defensively", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage(["2", "9"])).toBe(2);
    for (const bad of [undefined, "0", "-4", "abc", ""]) expect(parsePage(bad)).toBe(1);
  });

  it("only lets known values through", () => {
    expect(oneOf("URGENT", ["LOW", "URGENT"] as const)).toBe("URGENT");
    expect(oneOf("DROP TABLE", ["LOW", "URGENT"] as const)).toBeUndefined();
    expect(firstParam("  x ")).toBe("x");
    expect(firstParam("   ")).toBeUndefined();
  });

  it("counts pages", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(21)).toBe(2);
  });

  it("builds inclusive day ranges in São Paulo time", () => {
    const { gte, lt } = dayRange("2026-10-05", "2026-10-05");
    expect(gte?.toISOString()).toBe("2026-10-05T03:00:00.000Z");
    expect(lt?.toISOString()).toBe("2026-10-06T03:00:00.000Z");
    expect(dayRange("lixo", undefined)).toEqual({ gte: undefined, lt: undefined });
  });
});
