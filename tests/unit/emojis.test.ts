import { describe, expect, it } from "vitest";

import { EMOJI_GROUPS, searchEmojis } from "@/lib/emojis";

describe("emoji groups", () => {
  it("have one entry per emoji, without empties or repeats inside a group", () => {
    for (const group of EMOJI_GROUPS) {
      expect(group.emojis.length).toBeGreaterThan(10);
      expect(group.emojis.every((emoji) => emoji.trim().length > 0)).toBe(true);
      expect(new Set(group.emojis).size).toBe(group.emojis.length);
    }
  });

  it("ask for the colorful form of single-character symbols", () => {
    const status = EMOJI_GROUPS.find((group) => group.id === "status")!;
    expect(status.emojis).toContain("⚠️");
  });
});

describe("searchEmojis", () => {
  it("finds by Portuguese keyword, ignoring case and spaces around", () => {
    expect(searchEmojis("  PRAZO ")).toContain("📅️");
    expect(searchEmojis("bug")).toContain("🐛️");
  });

  it("finds a whole group by its name and returns nothing for empty or unknown text", () => {
    expect(searchEmojis("comida").length).toBeGreaterThan(10);
    expect(searchEmojis("")).toEqual([]);
    expect(searchEmojis("zzzzzz")).toEqual([]);
  });
});
