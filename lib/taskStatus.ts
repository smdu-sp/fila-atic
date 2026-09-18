import { TaskStatus } from "@prisma/client";

// A task is "open" until it is finished (done or deployed) or cancelled.
export const DONE_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.DONE,
  TaskStatus.DEPLOYED,
];

export const CLOSED_TASK_STATUSES: TaskStatus[] = [
  ...DONE_TASK_STATUSES,
  TaskStatus.CANCELED,
];

export const isTaskOpen = (status: TaskStatus) =>
  !CLOSED_TASK_STATUSES.includes(status);

// Progress ignores cancelled tasks: they were never going to be delivered.
export function summarizeTasks(statuses: TaskStatus[]) {
  const canceled = statuses.filter((s) => s === TaskStatus.CANCELED).length;
  const total = statuses.length - canceled;
  const done = statuses.filter((s) => DONE_TASK_STATUSES.includes(s)).length;

  return {
    total,
    done,
    open: total - done,
    canceled,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
