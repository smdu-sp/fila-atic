import { TaskStatus, type ProjectPriority } from "@prisma/client";

// Canonical column order of the task board, shared by the board itself and
// by every place that offers a status <Select> (create and edit dialogs).
export const TASK_STATUS_ORDER: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.TESTING,
  TaskStatus.WAITING,
  TaskStatus.PAUSED,
  TaskStatus.DONE,
  TaskStatus.DEPLOYED,
  TaskStatus.CANCELED,
];

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: ProjectPriority;
  labels: string[];
  // Lower comes first inside a column (see moveTask).
  position: number;
  commentCount: number;
  attachmentCount: number;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: Date | string | null;
  createdAt: string | Date;
  // only when tasks of several projects are listed together
  projectId?: string;
  projectTitle?: string;
};

// Same order the server uses: manual position, then newest first.
export function compareTasks(a: TaskItem, b: TaskItem) {
  if (a.position !== b.position) return a.position - b.position;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}
