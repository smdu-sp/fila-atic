import type {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
  TaskStatus,
} from "@prisma/client";

// One color per status/priority/category, the same on every chart so a color
// means the same thing on the dashboard and on the reports. Hex on purpose:
// they read well on both the light and the dark theme.

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  IN_QUEUE: "#94a3b8",
  IN_ANALYSIS: "#f59e0b",
  IN_DEVELOPMENT: "#0ea5e9",
  IN_TESTING: "#8b5cf6",
  FINISHED: "#10b981",
  CANCELED: "#ef4444",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  TODO: "#94a3b8",
  IN_PROGRESS: "#0ea5e9",
  TESTING: "#8b5cf6",
  WAITING: "#f59e0b",
  PAUSED: "#a8a29e",
  DONE: "#10b981",
  DEPLOYED: "#059669",
  CANCELED: "#ef4444",
};

export const PRIORITY_COLORS: Record<ProjectPriority, string> = {
  LOW: "#94a3b8",
  MEDIUM: "#0ea5e9",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
};

export const CATEGORY_COLORS: Record<ProjectCategory | "NONE", string> = {
  BUG: "#ef4444",
  IMPROVEMENT: "#0ea5e9",
  NEW_SYSTEM: "#8b5cf6",
  SUPPORT: "#f59e0b",
  OTHER: "#64748b",
  NONE: "#cbd5e1",
};

// Series colors for the "opened vs finished" style comparisons.
export const SERIES_COLORS = {
  primary: "#1d4ed8",
  positive: "#10b981",
  warning: "#f59e0b",
  danger: "#ef4444",
  neutral: "#94a3b8",
} as const;
