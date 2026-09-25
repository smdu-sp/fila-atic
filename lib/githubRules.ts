import { TaskStatus } from "@prisma/client";

// How far along the board a status is. Waiting and paused sit with "to do":
// the work has not moved forward. Cancelled is outside the line.
const RANK: Record<TaskStatus, number> = {
  TODO: 0,
  WAITING: 0,
  PAUSED: 0,
  IN_PROGRESS: 1,
  TESTING: 2,
  DONE: 3,
  DEPLOYED: 4,
  CANCELED: -1,
};

// The status a GitHub event should put a task in, or null to leave it alone.
// A cancelled task is never revived by a commit, and with `onlyForward` (the
// default) an event never pulls a task back to an earlier column.
export function resolveTargetStatus(
  current: TaskStatus,
  target: TaskStatus | null,
  onlyForward: boolean,
): TaskStatus | null {
  if (!target || target === current) return null;
  if (current === TaskStatus.CANCELED) return null;
  if (onlyForward && RANK[target] < RANK[current]) return null;

  return target;
}
