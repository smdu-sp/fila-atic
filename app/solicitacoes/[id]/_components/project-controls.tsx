"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Role, ProjectPriority, ProjectStatus } from "@prisma/client";
import { toast } from "sonner";

import { assignDeveloper, removeDeveloper } from "@/actions/projectActions";
import { updateProjectStatusRestricted } from "@/actions/solicitacaoActions";
import { ProjectUpdateForm } from "@/components/project-update-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  assignedDevelopers: DeveloperOption[];
  assignableDevelopers: DeveloperOption[];
  variant?: "card" | "inline";
};

export function ProjectControls({
  projectId,
  role,
  defaultStatus,
  defaultPriority,
  assignedDevelopers,
  assignableDevelopers,
  variant = "card",
}: ProjectControlsProps) {
  const router = useRouter();
  const [selectedDev, setSelectedDev] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [statusValue, setStatusValue] = useState<ProjectStatus>(defaultStatus);
  const canManageAll = role === Role.COORDINATOR || role === Role.DEV_GLOBAL;
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

  const handleRemove = (userId: string) => {
    startTransition(async () => {
      const result = await removeDeveloper({ projectId, userId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Desenvolvedor removido.");
      router.refresh();
    });
  };

  if (!canUpdateStatus) {
    return null;
  }

  const isInline = variant === "inline";
  const updateFormId = `project-update-${projectId}`;
  const containerClassName = isInline
    ? "mt-4 grid gap-2 rounded-lg border border-border/60 bg-background p-3"
    : "grid gap-4 rounded-lg border border-border/60 p-4";

  return (
    <div className={containerClassName}>
      {!isInline ? (
        <div className="grid gap-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Gestao do chamado
          </p>
        </div>
      ) : null}

      {role === Role.DEV_RESTRICTED ? (
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
          <Select
            value={statusValue}
            onValueChange={(value) => {
              const nextStatus = value as ProjectStatus;
              setStatusValue(nextStatus);
              startTransition(async () => {
                const result = await updateProjectStatusRestricted(
                  projectId,
                  nextStatus,
                );
                if (!result.success) {
                  toast.error(result.error);
                  return;
                }
                toast.success("Status atualizado.");
                router.refresh();
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
              <Button size="xs" onClick={handleAssign} disabled={!selectedDev}>
                Atribuir
              </Button>
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
