import { ProjectPriority, ProjectStatus, TaskStatus } from "@prisma/client";

export const statusLabels: Record<ProjectStatus, string> = {
  IN_QUEUE: "Na fila",
  IN_ANALYSIS: "Em analise",
  IN_DEVELOPMENT: "Em desenvolvimento",
  IN_TESTING: "Em testes",
  FINISHED: "Finalizado",
  CANCELED: "Cancelado",
};

export const statusBadgeClasses: Record<ProjectStatus, string> = {
  IN_QUEUE: "bg-slate-100 text-slate-700 border-slate-200",
  IN_ANALYSIS: "bg-amber-100 text-amber-800 border-amber-200",
  IN_DEVELOPMENT: "bg-sky-100 text-sky-800 border-sky-200",
  IN_TESTING: "bg-violet-100 text-violet-800 border-violet-200",
  FINISHED: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CANCELED: "bg-rose-100 text-rose-800 border-rose-200",
};

export const priorityLabels: Record<ProjectPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const taskStatusLabels: Record<TaskStatus, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  TESTING: "Em testes",
  WAITING: "Em espera",
  PAUSED: "Pausado",
  DONE: "Concluido",
  DEPLOYED: "Publicado",
};

export function getStatusLabel(status: ProjectStatus) {
  return statusLabels[status] ?? status;
}

export function getStatusBadgeClass(status: ProjectStatus) {
  return statusBadgeClasses[status] ?? "";
}

export function getPriorityLabel(priority: ProjectPriority) {
  return priorityLabels[priority] ?? priority;
}

export function getTaskStatusLabel(status: TaskStatus) {
  return taskStatusLabels[status] ?? status;
}
