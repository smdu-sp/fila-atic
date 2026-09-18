import { describe, expect, it } from "vitest";

import {
  MAX_LABEL_LENGTH,
  MAX_LABELS,
  normalizeLabels,
  parseLabelsText,
} from "@/lib/taskFields";

describe("normalizeLabels", () => {
  it("trims, collapses spaces and drops empty entries", () => {
    expect(normalizeLabels(["  api ", "banco   de  dados", "", "   "])).toEqual({
      ok: true,
      value: ["api", "banco de dados"],
    });
  });

  it("removes repeats ignoring case, keeping the first spelling", () => {
    expect(normalizeLabels(["API", "api", "Api", "front"])).toEqual({ ok: true, value: ["API", "front"] });
  });

  it("refuses too many or too long labels and anything that is not a string list", () => {
    const many = Array.from({ length: MAX_LABELS + 1 }, (_, i) => `l${i}`);
    expect(normalizeLabels(many)).toEqual({ ok: false });
    expect(normalizeLabels(["x".repeat(MAX_LABEL_LENGTH + 1)])).toEqual({ ok: false });
    expect(normalizeLabels("api")).toEqual({ ok: false });
    expect(normalizeLabels([1, 2])).toEqual({ ok: false });
    expect(normalizeLabels(null)).toEqual({ ok: false });
    // repeats do not count towards the limit
    expect(normalizeLabels([...many.slice(0, MAX_LABELS), "L0"]).ok).toBe(true);
  });

  it("parses comma separated text", () => {
    expect(parseLabelsText(" api, banco de dados ,, ")).toEqual(["api", "banco de dados"]);
    expect(parseLabelsText("")).toEqual([]);
  });
});
