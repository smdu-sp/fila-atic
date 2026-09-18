"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ProjectPriority, ProjectStatus } from "@prisma/client";

import { updateProject } from "@/actions/projectActions";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStatusChangeGuard } from "@/components/use-status-change";
import { getPriorityLabel, getStatusLabel } from "@/lib/projectLabels";

const schema = z.object({
  status: z.nativeEnum(ProjectStatus),
  priority: z.nativeEnum(ProjectPriority),
  dueDate: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type ProjectUpdateFormProps = {
  projectId: string;
  defaultStatus: ProjectStatus;
  defaultPriority: ProjectPriority;
  // "YYYY-MM-DD". Only managers set the delivery forecast, so the field is
  // opt-in: leaving it out never touches the stored date.
  showDueDate?: boolean;
  defaultDueDate?: string;
  compact?: boolean;
  // grid/inline: compact rows inside lists. stack: labelled fields for dialogs.
  layout?: "grid" | "inline" | "stack";
  formId?: string;
  showSubmit?: boolean;
  onSaved?: () => void;
};

export function ProjectUpdateForm({
  projectId,
  defaultStatus,
  defaultPriority,
  showDueDate = false,
  defaultDueDate = "",
  compact = false,
  layout = "grid",
  formId,
  showSubmit = true,
  onSaved,
}: ProjectUpdateFormProps) {
  const [isPending, startTransition] = useTransition();
  const guard = useStatusChangeGuard(() => {
    toast.success("Projeto atualizado.");
    onSaved?.();
  });
  const { control, register, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: defaultStatus,
      priority: defaultPriority,
      dueDate: defaultDueDate,
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      await guard.request(values.status, (options) =>
        updateProject({
          id: projectId,
          status: values.status,
          priority: values.priority,
          ...(showDueDate ? { dueDate: values.dueDate || null } : {}),
          ...options,
        }),
      );
    });
  });

  const stack = layout === "stack";
  const inline = layout === "inline";
  const formClassName = stack
    ? "grid gap-4"
    : inline
      ? "flex-row items-center gap-2 shrink-0 whitespace-nowrap"
      : showDueDate
        ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
        : compact
          ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          : "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]";
  const statusWidthClass = inline ? "w-[140px] shrink-0" : "w-full";
  const priorityWidthClass = inline ? "w-[120px] shrink-0" : "w-full";

  const statusSelect = (
    <Controller
      control={control}
      name="status"
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger
            id={stack ? "project-status" : undefined}
            className={statusWidthClass}
            size={stack ? "default" : "sm"}
          >
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
      )}
    />
  );

  const prioritySelect = (
    <Controller
      control={control}
      name="priority"
      render={({ field }) => (
        <Select value={field.value} onValueChange={field.onChange}>
          <SelectTrigger
            id={stack ? "project-priority" : undefined}
            className={priorityWidthClass}
            size={stack ? "default" : "sm"}
          >
            <SelectValue placeholder="Prioridade" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(ProjectPriority).map((priority) => (
              <SelectItem key={priority} value={priority}>
                {getPriorityLabel(priority)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    />
  );

  const dueInput = showDueDate ? (
    <Input
      id={stack ? "project-due" : undefined}
      type="date"
      aria-label="Previsão de entrega"
      title="Previsão de entrega"
      className={inline ? "h-7 w-[150px] shrink-0" : stack ? "" : "h-7"}
      {...register("dueDate")}
    />
  ) : null;

  const submit = showSubmit ? (
    <Button
      size={stack ? "default" : "xs"}
      type="submit"
      disabled={isPending}
    >
      {isPending ? "Salvando" : "Salvar"}
    </Button>
  ) : null;

  return (
    <>
      <Form onSubmit={onSubmit} className={formClassName} id={formId}>
        {stack ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="project-status">Status</Label>
              {statusSelect}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="project-priority">Prioridade</Label>
              {prioritySelect}
            </div>
            {dueInput ? (
              <div className="grid gap-1.5">
                <Label htmlFor="project-due">Previsão de entrega</Label>
                {dueInput}
                <span className="text-xs text-muted-foreground">
                  Deixe em branco para remover a previsão.
                </span>
              </div>
            ) : null}
            {submit ? <DialogFooter>{submit}</DialogFooter> : null}
          </>
        ) : (
          <>
            {statusSelect}
            {prioritySelect}
            {dueInput}
            {submit}
          </>
        )}
      </Form>
      {guard.dialog}
    </>
  );
}
