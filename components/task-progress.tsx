import { cn } from "@/lib/utils";

// done/total already exclude cancelled tasks (see summarizeTasks).
export function TaskProgress({
  done,
  total,
  variant = "inline",
  className,
}: {
  done: number;
  total: number;
  // "inline": short bar with the count beside it (lists and cards).
  // "bar": full-width, thicker bar on its own (the Kanban progress card).
  variant?: "inline" | "bar";
  className?: string;
}) {
  if (total === 0) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Sem tarefas
      </span>
    );
  }

  const percent = Math.round((done / total) * 100);

  if (variant === "bar") {
    return (
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso das tarefas"
        title={`${done} de ${total} tarefas concluídas (${percent}%)`}
        className={cn("h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            percent === 100 ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground",
        className,
      )}
      title={`${done} de ${total} tarefas concluídas (${percent}%)`}
    >
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso das tarefas"
        className="h-1.5 w-full min-w-12 max-w-28 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            percent === 100 ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="tabular-nums">
        {done}/{total}
      </span>
    </div>
  );
}
