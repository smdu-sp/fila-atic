"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ProjectPriority, ProjectStatus } from "@prisma/client";

import { updateProject } from "@/actions/projectActions";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPriorityLabel, getStatusLabel } from "@/lib/projectLabels";

const schema = z.object({
  status: z.nativeEnum(ProjectStatus),
  priority: z.nativeEnum(ProjectPriority),
});

type FormValues = z.infer<typeof schema>;

type ProjectUpdateFormProps = {
  projectId: string;
  defaultStatus: ProjectStatus;
  defaultPriority: ProjectPriority;
  compact?: boolean;
  layout?: "grid" | "inline";
  formId?: string;
  showSubmit?: boolean;
};

export function ProjectUpdateForm({
  projectId,
  defaultStatus,
  defaultPriority,
  compact = false,
  layout = "grid",
  formId,
  showSubmit = true,
}: ProjectUpdateFormProps) {
  const [isPending, startTransition] = useTransition();
  const { control, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: defaultStatus,
      priority: defaultPriority,
    },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await updateProject({
        id: projectId,
        status: values.status,
        priority: values.priority,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Projeto atualizado.");
    });
  });

  const inline = layout === "inline";
  const formClassName = inline
    ? "flex-row items-center gap-2 shrink-0 whitespace-nowrap"
    : compact
      ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
      : "grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]";
  const statusWidthClass = inline ? "w-[140px] shrink-0" : "w-full";
  const priorityWidthClass = inline ? "w-[120px] shrink-0" : "w-full";

  return (
    <Form onSubmit={onSubmit} className={formClassName} id={formId}>
      <Controller
        control={control}
        name="status"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className={statusWidthClass} size="sm">
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
      <Controller
        control={control}
        name="priority"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger className={priorityWidthClass} size="sm">
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
      {showSubmit ? (
        <Button size="xs" type="submit" disabled={isPending}>
          {isPending ? "Salvando" : "Salvar"}
        </Button>
      ) : null}
    </Form>
  );
}
