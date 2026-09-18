"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ProjectStatus,
  Role,
  TaskStatus,
  type ProjectPriority,
} from "@prisma/client";
import { toast } from "sonner";

import { updateProject } from "@/actions/projectActions";
import { updateProjectStatusRestricted } from "@/actions/solicitacaoActions";
import { CreateTaskForm } from "@/app/kanban/_components/create-task-form";
import { PriorityIcon, UserAvatar } from "@/app/kanban/_components/board-ui";
import { DueBadge } from "@/components/due-badge";
import { TaskProgress } from "@/components/task-progress";
import { useStatusChangeGuard } from "@/components/use-status-change";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isTaskOpen, summarizeTasks } from "@/lib/taskStatus";

type PanelTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: ProjectPriority;
  labels: string[];
  assigneeName: string | null;
  dueDate: Date | null;
};

type PanelProps = {
  projectId: string;
  projectStatus: ProjectStatus;
  role: Role;
  tasks: PanelTask[];
  taskLabels: Record<TaskStatus, string>;
  team: Array<{ id: string; name: string }>;
  // People that can be picked as owner; empty when the role cannot assign.
  assignableDevelopers: Array<{ id: string; name: string }>;
};

const CLOSED_PROJECT: ProjectStatus[] = [
  ProjectStatus.FINISHED,
  ProjectStatus.CANCELED,
];

export function ProjectTasksPanel({
  projectId,
  projectStatus,
  role,
  tasks,
  taskLabels,
  team,
  assignableDevelopers,
}: PanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const guard = useStatusChangeGuard(() => {
    toast.success("Projeto finalizado.");
    router.refresh();
  });

  const summary = useMemo(
    () => summarizeTasks(tasks.map((task) => task.status)),
    [tasks],
  );
  const projectIsOpen = !CLOSED_PROJECT.includes(projectStatus);
  const allDone = summary.total > 0 && summary.open === 0 && projectIsOpen;

  const finishProject = () =>
    startTransition(async () => {
      await guard.request(ProjectStatus.FINISHED, (options) =>
        role === Role.DEV_RESTRICTED
          ? updateProjectStatusRestricted(
              projectId,
              ProjectStatus.FINISHED,
              options,
            )
          : updateProject({
              id: projectId,
              status: ProjectStatus.FINISHED,
              ...options,
            }),
      );
    });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Tarefas</CardTitle>
            <CardDescription>
              Andamento do trabalho da equipe neste projeto.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link href={`/kanban?projeto=${projectId}`}>Abrir no Kanban</Link>
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              Nova tarefa
            </Button>
          </div>
        </div>
        <TaskProgress
          className="pt-2"
          done={summary.done}
          total={summary.total}
        />
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {allDone ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            <span>
              Todas as tarefas foram concluídas. Já dá para finalizar o projeto?
            </span>
            <Button size="sm" onClick={finishProject} disabled={isPending}>
              Finalizar projeto
            </Button>
          </div>
        ) : null}

        {tasks.length ? (
          <ul className="grid gap-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <PriorityIcon priority={task.priority} />
                  <span
                    className={
                      task.status === TaskStatus.CANCELED
                        ? "truncate text-muted-foreground line-through"
                        : "truncate"
                    }
                  >
                    {task.title}
                  </span>
                  {task.labels.map((label) => (
                    <Badge
                      key={label}
                      variant="secondary"
                      className="hidden shrink-0 sm:inline-flex"
                    >
                      {label}
                    </Badge>
                  ))}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <DueBadge
                    dueDate={task.dueDate}
                    closed={!isTaskOpen(task.status)}
                  />
                  <Badge variant="outline">{taskLabels[task.status]}</Badge>
                  {task.assigneeName ? (
                    <UserAvatar name={task.assigneeName} />
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Nenhuma tarefa criada ainda.</p>
        )}
      </CardContent>

      {guard.dialog}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>
              Registre uma tarefa para este projeto.
            </DialogDescription>
          </DialogHeader>
          <CreateTaskForm
            projects={[{ id: projectId, title: "" }]}
            initialProjectId={projectId}
            hideProjectSelect
            assignees={assignableDevelopers}
            teamIds={team.map((person) => person.id)}
            onCreated={() => {
              setCreateOpen(false);
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
