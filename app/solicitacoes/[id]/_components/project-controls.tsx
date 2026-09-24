"use client";

import { isCoordination } from "@/lib/roles";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Role,
  type ProjectCategory,
  ProjectPriority,
  ProjectStatus,
} from "@prisma/client";
import { toast } from "sonner";

import { assignDeveloper, removeDeveloper } from "@/actions/projectActions";
import { updateProjectStatusRestricted } from "@/actions/solicitacaoActions";
import { UserAvatar } from "@/app/kanban/_components/board-ui";
import { OpenTasksDialog } from "@/components/open-tasks-dialog";
import { ProjectUpdateForm } from "@/components/project-update-form";
import { useStatusChangeGuard } from "@/components/use-status-change";
import type { OpenTask } from "@/lib/projectStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStatusLabel } from "@/lib/projectLabels";

type DeveloperOption = {
  id: string;
  name: string;
  role: Role;
};

type ProjectControlsProps = {
  projectId: string;
  role: Role;
  defaultStatus: ProjectStatus;
  defaultPriority: ProjectPriority;
  // "YYYY-MM-DD" of the delivery forecast, when there is one.
  defaultDueDate?: string;
  defaultCategory?: ProjectCategory | null;
  assignedDevelopers: DeveloperOption[];
  assignableDevelopers: DeveloperOption[];
  // card/inline: the old layouts (inline is the one actually in use).
  // sidebar: labelled fields stacked in a column, for the Jira-like detail
  // page's right-hand panel.
  variant?: "card" | "inline" | "sidebar";
};

export function ProjectControls({
  projectId,
  role,
  defaultStatus,
  defaultPriority,
  defaultDueDate = "",
  defaultCategory = null,
  assignedDevelopers,
  assignableDevelopers,
  variant = "card",
}: ProjectControlsProps) {
  const router = useRouter();
  const [selectedDev, setSelectedDev] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [statusValue, setStatusValue] = useState<ProjectStatus>(defaultStatus);
  const [removal, setRemoval] = useState<{
    userId: string;
    name: string;
    openTasks: OpenTask[];
  } | null>(null);
  const guard = useStatusChangeGuard((status) => {
    setStatusValue(status);
    toast.success("Status atualizado.");
    router.refresh();
  });
  const canManageAll = isCoordination(role) || role === Role.DEV_GLOBAL;
  const canUpdateStatus = canManageAll || role === Role.DEV_RESTRICTED;

  const availableDevelopers = useMemo(() => {
    const assignedIds = new Set(assignedDevelopers.map((dev) => dev.id));
    return assignableDevelopers.filter((dev) => !assignedIds.has(dev.id));
  }, [assignedDevelopers, assignableDevelopers]);

  const handleAssign = () => {
    if (!selectedDev) return;
    startTransition(async () => {
      const result = await assignDeveloper({
        projectId,
        userId: selectedDev,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Desenvolvedor atribuido.");
      setSelectedDev("");
      router.refresh();
    });
  };

  const handleRemove = (userId: string, unassignTasks = false) => {
    startTransition(async () => {
      const result = await removeDeveloper({
        projectId,
        userId,
        unassignTasks,
      });
      if (!result.success) {
        if (result.openTasks?.length) {
          const name =
            assignedDevelopers.find((dev) => dev.id === userId)?.name ??
            "O desenvolvedor";
          setRemoval({ userId, name, openTasks: result.openTasks });
          return;
        }
        toast.error(result.error);
        return;
      }
      setRemoval(null);
      toast.success("Desenvolvedor removido.");
      router.refresh();
    });
  };

  if (!canUpdateStatus) {
    return null;
  }

  if (variant === "sidebar") {
    return (
      <>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {role === Role.DEV_RESTRICTED ? (
            <div className="grid gap-1.5">
              <Label htmlFor="project-status-sidebar">Status</Label>
              <Select
                value={statusValue}
                onValueChange={(value) => {
                  const nextStatus = value as ProjectStatus;
                  const previous = statusValue;
                  setStatusValue(nextStatus);
                  startTransition(async () => {
                    const applied = await guard.request(nextStatus, (options) =>
                      updateProjectStatusRestricted(
                        projectId,
                        nextStatus,
                        options,
                      ),
                    );
                    if (!applied) setStatusValue(previous);
                  });
                }}
              >
                <SelectTrigger id="project-status-sidebar" className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ProjectStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {getStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <ProjectUpdateForm
              projectId={projectId}
              defaultStatus={defaultStatus}
              defaultPriority={defaultPriority}
              showDueDate
              defaultDueDate={defaultDueDate}
              showCategory
              defaultCategory={defaultCategory}
              layout="stack"
            />
          )}

          {canManageAll ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 border-t border-border/60 pt-4">
              <Label>Equipe</Label>
              {assignedDevelopers.length ? (
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                  {assignedDevelopers.map((dev) => (
                    <li
                      key={dev.id}
                      className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent/60"
                    >
                      <UserAvatar name={dev.name} />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {dev.name}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleRemove(dev.id)}
                        disabled={isPending}
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ninguém atribuído ainda.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Select value={selectedDev} onValueChange={setSelectedDev}>
                  <SelectTrigger className="min-w-0 flex-1 shrink" size="sm">
                    <SelectValue placeholder="Atribuir desenvolvedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDevelopers.map((dev) => (
                      <SelectItem key={dev.id} value={dev.id}>
                        {dev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="xs"
                  onClick={handleAssign}
                  disabled={!selectedDev}
                >
                  Atribuir
                </Button>
              </div>
            </div>
          ) : assignedDevelopers.length ? (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 border-t border-border/60 pt-4">
              <Label>Equipe</Label>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
                {assignedDevelopers.map((dev) => (
                  <li key={dev.id} className="flex items-center gap-2">
                    <UserAvatar name={dev.name} />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {dev.name}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        {guard.dialog}
        <OpenTasksDialog
          open={removal !== null}
          title={`Remover ${removal?.name ?? ""} do projeto?`}
          description={
            removal?.openTasks.length === 1
              ? "Há 1 tarefa em aberto com essa pessoa. Ao remover, ela fica sem responsável."
              : `Há ${removal?.openTasks.length ?? 0} tarefas em aberto com essa pessoa. Ao remover, elas ficam sem responsável.`
          }
          openTasks={removal?.openTasks ?? []}
          actions={[
            {
              label: "Remover e liberar tarefas",
              variant: "destructive",
              onClick: () => removal && handleRemove(removal.userId, true),
            },
          ]}
          busy={isPending}
          onClose={() => setRemoval(null)}
        />
      </>
    );
  }

  const isInline = variant === "inline";
  const updateFormId = `project-update-${projectId}`;
  const containerClassName = isInline
    ? "mt-4 grid gap-2 rounded-lg border border-border/60 bg-background p-3"
    : "grid gap-4 rounded-lg border border-border/60 p-4";

  return (
    <>
      <div className={containerClassName}>
        {!isInline ? (
          <div className="grid gap-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Gestao do projeto
            </p>
          </div>
        ) : null}

        {role === Role.DEV_RESTRICTED ? (
          <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
            <Select
              value={statusValue}
              onValueChange={(value) => {
                const nextStatus = value as ProjectStatus;
                const previous = statusValue;
                setStatusValue(nextStatus);
                startTransition(async () => {
                  const applied = await guard.request(nextStatus, (options) =>
                    updateProjectStatusRestricted(
                      projectId,
                      nextStatus,
                      options,
                    ),
                  );
                  // refused, or waiting for the person to decide in the dialog
                  if (!applied) setStatusValue(previous);
                });
              }}
            >
              <SelectTrigger className="w-[140px]" size="sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(ProjectStatus).map((status) => (
                  <SelectItem key={status} value={status}>
                    {getStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {!canManageAll ? (
          role !== Role.DEV_RESTRICTED ? (
            <ProjectUpdateForm
              projectId={projectId}
              defaultStatus={defaultStatus}
              defaultPriority={defaultPriority}
              compact
              layout={isInline ? "inline" : "grid"}
              formId={isInline ? updateFormId : undefined}
            />
          ) : null
        ) : null}

        {canManageAll ? (
          isInline ? (
            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
              <ProjectUpdateForm
                projectId={projectId}
                defaultStatus={defaultStatus}
                defaultPriority={defaultPriority}
                compact
                layout="inline"
                formId={updateFormId}
                showSubmit={false}
                showDueDate
                defaultDueDate={defaultDueDate}
                showCategory
                defaultCategory={defaultCategory}
              />
              <Select value={selectedDev} onValueChange={setSelectedDev}>
                <SelectTrigger className="w-[180px]" size="sm">
                  <SelectValue placeholder="Atribuir desenvolvedor" />
                </SelectTrigger>
                <SelectContent>
                  {availableDevelopers.map((dev) => (
                    <SelectItem key={dev.id} value={dev.id}>
                      {dev.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="xs" onClick={handleAssign} disabled={!selectedDev}>
                Atribuir
              </Button>
              <Button size="xs" type="submit" form={updateFormId}>
                Salvar
              </Button>
              {assignedDevelopers.length
                ? assignedDevelopers.map((dev) => (
                    <Badge key={dev.id} variant="outline" className="gap-2">
                      {dev.name}
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleRemove(dev.id)}
                        disabled={isPending}
                      >
                        Remover
                      </button>
                    </Badge>
                  ))
                : null}
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {assignedDevelopers.length
                  ? assignedDevelopers.map((dev) => (
                      <Badge key={dev.id} variant="outline" className="gap-2">
                        {dev.name}
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleRemove(dev.id)}
                          disabled={isPending}
                        >
                          Remover
                        </button>
                      </Badge>
                    ))
                  : null}
              </div>
              <div className="flex items-center gap-2">
                <Select value={selectedDev} onValueChange={setSelectedDev}>
                  <SelectTrigger className="w-full min-w-[200px]" size="sm">
                    <SelectValue placeholder="Atribuir desenvolvedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDevelopers.map((dev) => (
                      <SelectItem key={dev.id} value={dev.id}>
                        {dev.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="xs"
                  onClick={handleAssign}
                  disabled={!selectedDev}
                >
                  Atribuir
                </Button>
              </div>
            </div>
          )
        ) : null}
      </div>
      {guard.dialog}
      <OpenTasksDialog
        open={removal !== null}
        title={`Remover ${removal?.name ?? ""} do projeto?`}
        description={
          removal?.openTasks.length === 1
            ? "Há 1 tarefa em aberto com essa pessoa. Ao remover, ela fica sem responsável."
            : `Há ${removal?.openTasks.length ?? 0} tarefas em aberto com essa pessoa. Ao remover, elas ficam sem responsável.`
        }
        openTasks={removal?.openTasks ?? []}
        actions={[
          {
            label: "Remover e liberar tarefas",
            variant: "destructive",
            onClick: () => removal && handleRemove(removal.userId, true),
          },
        ]}
        busy={isPending}
        onClose={() => setRemoval(null)}
      />
    </>
  );
}
