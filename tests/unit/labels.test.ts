import { describe, expect, it } from "vitest";

import {
  isHexColor,
  LABEL_COLOR_PRESETS,
  normalizeHexColor,
  readableTextColor,
} from "@/lib/labelColors";
import { matchPalette, normalizeLabelName } from "@/lib/labels";

describe("label colors", () => {
  it("accept only #rrggbb and lowercase it", () => {
    expect(isHexColor("#3b82f6")).toBe(true);
    expect(normalizeHexColor("#3B82F6")).toBe("#3b82f6");

    for (const bad of ["3b82f6", "#fff", "#gggggg", "red", "#3b82f6ff", "", null, 7]) {
      expect(normalizeHexColor(bad)).toBeNull();
    }
  });

  it("offer only valid presets", () => {
    expect(LABEL_COLOR_PRESETS.every(isHexColor)).toBe(true);
    expect(new Set(LABEL_COLOR_PRESETS).size).toBe(LABEL_COLOR_PRESETS.length);
  });

  it("pick a readable text color", () => {
    expect(readableTextColor("#ffffff")).toBe("#000000");
    expect(readableTextColor("#facc15")).toBe("#000000");
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#1e3a8a")).toBe("#ffffff");
    expect(readableTextColor("nope")).toBe("#000000");
  });
});

describe("label names", () => {
  it("are trimmed, collapsed and bounded", () => {
    expect(normalizeLabelName("  banco   de  dados ")).toBe("banco de dados");
    expect(normalizeLabelName("   ")).toBeNull();
    expect(normalizeLabelName("x".repeat(31))).toBeNull();
    expect(normalizeLabelName("x".repeat(30))).toBe("x".repeat(30));
    expect(normalizeLabelName(42)).toBeNull();
  });
});

describe("matchPalette", () => {
  it("swaps names for the palette spelling and reports the unknown ones", () => {
    expect(matchPalette(["URGENTE", "api", "sumiu"], ["Urgente", "API"])).toEqual({
      names: ["Urgente", "API"],
      unknown: ["sumiu"],
    });
  });

  it("handles an empty request and an empty palette", () => {
    expect(matchPalette([], ["a"])).toEqual({ names: [], unknown: [] });
    expect(matchPalette(["a"], [])).toEqual({ names: [], unknown: ["a"] });
  });
});
