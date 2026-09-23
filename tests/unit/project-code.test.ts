import { describe, expect, it } from "vitest";

import { formatProjectCode } from "@/lib/projectCode";

describe("formatProjectCode", () => {
  it("pads to 4 digits with the ATC- prefix", () => {
    expect(formatProjectCode(1)).toBe("ATC-0001");
    expect(formatProjectCode(42)).toBe("ATC-0042");
    expect(formatProjectCode(9999)).toBe("ATC-9999");
  });

  it("does not truncate a code with more than 4 digits", () => {
    expect(formatProjectCode(12345)).toBe("ATC-12345");
  });
});
