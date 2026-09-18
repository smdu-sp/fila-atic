"use client";

import { useEffect, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { TaskStatus } from "@prisma/client";

import { createTask } from "@/actions/taskActions";
import { Button } from "@/components/ui/button";
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
});

type FormValues = z.infer<typeof schema>;

type CreateTaskFormProps = {
  projects: ProjectOption[];
  initialProjectId?: string;
  initialStatus?: TaskStatus;
  hideProjectSelect?: boolean;
  onCreated?: () => void;
};

export function CreateTaskForm({
  projects,
  initialProjectId,
  initialStatus,
  hideProjectSelect = false,
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
      },
    });

  useEffect(() => {
    if (initialProjectId || initialStatus) {
      reset({
        projectId: initialProjectId ?? "",
        title: "",
        description: "",
        status: initialStatus,
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
      });
      onCreated?.();
    });
  });

  return (
    <Form onSubmit={onSubmit} className="grid gap-3">
      {hideProjectSelect ? null : (
        <>
          <Controller
            control={control}
            name="projectId"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Projeto" />
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
        </>
      )}
      <div className="grid gap-2">
        <Input placeholder="Titulo da tarefa" {...register("title")} />
        {formState.errors.title ? (
          <span className="text-xs text-destructive">
            {formState.errors.title.message}
          </span>
        ) : null}
      </div>
      <Input placeholder="Descricao (opcional)" {...register("description")} />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Criando" : "Criar tarefa"}
      </Button>
    </Form>
  );
}
