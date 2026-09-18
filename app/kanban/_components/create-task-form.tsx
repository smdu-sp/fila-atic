"use client";

import { useEffect, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { TaskStatus } from "@prisma/client";

import { createTask } from "@/actions/taskActions";
import { AssigneeItems } from "@/app/kanban/_components/assignee-items";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectOption = { id: string; title: string };

const schema = z.object({
  projectId: z.string().min(1, "Selecione um projeto"),
  title: z.string().min(3, "Informe o titulo"),
  description: z.string().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type CreateTaskFormProps = {
  projects: ProjectOption[];
  initialProjectId?: string;
  initialStatus?: TaskStatus;
  hideProjectSelect?: boolean;
  // Empty when the current role cannot assign tasks.
  assignees?: Array<{ id: string; name: string }>;
  // Members of the project: listed first in the assignee picker.
  teamIds?: string[];
  onCreated?: () => void;
};

export function CreateTaskForm({
  projects,
  initialProjectId,
  initialStatus,
  hideProjectSelect = false,
  assignees = [],
  teamIds = [],
  onCreated,
}: CreateTaskFormProps) {
  const [isPending, startTransition] = useTransition();
  const { control, register, handleSubmit, reset, formState } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        projectId: initialProjectId ?? "",
        title: "",
        description: "",
        status: initialStatus,
        assigneeId: "",
        dueDate: "",
      },
    });

  useEffect(() => {
    if (initialProjectId || initialStatus) {
      reset({
        projectId: initialProjectId ?? "",
        title: "",
        description: "",
        status: initialStatus,
        assigneeId: "",
        dueDate: "",
      });
    }
  }, [initialProjectId, initialStatus, reset]);

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await createTask({
        projectId: values.projectId,
        title: values.title,
        description: values.description,
        status: values.status,
        assigneeId: values.assigneeId || null,
        dueDate: values.dueDate || null,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Tarefa criada.");
      reset({
        projectId: values.projectId,
        title: "",
        description: "",
        status: values.status,
        assigneeId: "",
        dueDate: "",
      });
      onCreated?.();
    });
  });

  return (
    <Form onSubmit={onSubmit} className="grid gap-4">
      {hideProjectSelect ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor="task-project">Projeto</Label>
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="task-project" className="w-full">
                  <SelectValue placeholder="Selecione o projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {formState.errors.projectId ? (
            <span className="text-xs text-destructive">
              {formState.errors.projectId.message}
            </span>
          ) : null}
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="task-title">Título</Label>
        <Input
          id="task-title"
          placeholder="O que precisa ser feito"
          {...register("title")}
        />
        {formState.errors.title ? (
          <span className="text-xs text-destructive">
            {formState.errors.title.message}
          </span>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="task-description">Descrição (opcional)</Label>
        <Input
          id="task-description"
          placeholder="Detalhes, links, critérios de aceite"
          {...register("description")}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {assignees.length ? (
          <div className="grid gap-1.5">
            <Label htmlFor="task-assignee">Responsável (opcional)</Label>
            <Controller
              control={control}
              name="assigneeId"
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(value) =>
                    field.onChange(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger id="task-assignee" className="w-full">
                    <SelectValue placeholder="Sem responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <AssigneeItems assignees={assignees} teamIds={teamIds} />
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="task-due">Prazo (opcional)</Label>
          <Input id="task-due" type="date" {...register("dueDate")} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Criando" : "Criar tarefa"}
        </Button>
      </DialogFooter>
    </Form>
  );
}
