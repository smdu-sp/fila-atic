import { describe, expect, it } from "vitest";
import { TaskStatus } from "@prisma/client";

import { resolveTargetStatus } from "@/lib/githubRules";

const { TODO, WAITING, PAUSED, IN_PROGRESS, TESTING, DONE, DEPLOYED, CANCELED } = TaskStatus;

describe("resolveTargetStatus", () => {
  it("moves forward along the board", () => {
    expect(resolveTargetStatus(TODO, IN_PROGRESS, true)).toBe(IN_PROGRESS);
    expect(resolveTargetStatus(IN_PROGRESS, TESTING, true)).toBe(TESTING);
    expect(resolveTargetStatus(TESTING, DONE, true)).toBe(DONE);
    expect(resolveTargetStatus(DONE, DEPLOYED, true)).toBe(DEPLOYED);
    // skipping columns is fine
    expect(resolveTargetStatus(TODO, DONE, true)).toBe(DONE);
  });

  it("treats waiting and paused as not started yet", () => {
    expect(resolveTargetStatus(WAITING, IN_PROGRESS, true)).toBe(IN_PROGRESS);
    expect(resolveTargetStatus(PAUSED, IN_PROGRESS, true)).toBe(IN_PROGRESS);
  });

  it("does nothing when there is no target or the task is already there", () => {
    expect(resolveTargetStatus(TODO, null, true)).toBeNull();
    expect(resolveTargetStatus(DONE, DONE, false)).toBeNull();
  });

  it("never goes back while only-forward is on, but may when it is off", () => {
    expect(resolveTargetStatus(DONE, IN_PROGRESS, true)).toBeNull();
    expect(resolveTargetStatus(DEPLOYED, TESTING, true)).toBeNull();
    expect(resolveTargetStatus(DONE, IN_PROGRESS, false)).toBe(IN_PROGRESS);
  });

  it("never revives a cancelled task, whatever the setting", () => {
    expect(resolveTargetStatus(CANCELED, IN_PROGRESS, true)).toBeNull();
    expect(resolveTargetStatus(CANCELED, DEPLOYED, false)).toBeNull();
  });
});
