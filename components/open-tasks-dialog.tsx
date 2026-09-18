"use client";

import type { TaskStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getTaskStatusLabel } from "@/lib/projectLabels";

export type DialogAction = {
  label: string;
  variant?: "default" | "outline" | "destructive";
  onClick: () => void;
};

const MAX_LISTED = 6;

// Asks the person to decide something about tasks that are still open.
export function OpenTasksDialog({
  open,
  title,
  description,
  openTasks,
  actions,
  busy = false,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  openTasks: Array<{ id: string; title: string; status: TaskStatus }>;
  actions: DialogAction[];
  busy?: boolean;
  onClose: () => void;
}) {
  const listed = openTasks.slice(0, MAX_LISTED);
  const hidden = openTasks.length - listed.length;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1.5 text-sm">
          {listed.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-1.5"
            >
              <span className="truncate">{task.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {getTaskStatusLabel(task.status)}
              </span>
            </li>
          ))}
          {hidden > 0 ? (
            <li className="px-1 text-xs text-muted-foreground">
              e mais {hidden}
            </li>
          ) : null}
        </ul>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Voltar
          </Button>
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "default"}
              onClick={action.onClick}
              disabled={busy}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
