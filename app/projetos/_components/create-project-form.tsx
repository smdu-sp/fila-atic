"use client";

import { useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ProjectPriority } from "@prisma/client";

import { createProject } from "@/actions/projectActions";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import {
  PROJECT_REQUEST_FIELDS,
  type ProjectRequestFieldConfig,
} from "@/lib/requestForm";

const schema = z.object({
  title: z.string().min(3, "Informe o titulo"),
  description: z.string().min(10, "Informe a descricao"),
  justification: z.string().min(10, "Informe a justificativa"),
  priority: z.nativeEnum(ProjectPriority),
  customFields: z.record(z.string().optional()).optional(),
});

type FormValues = z.infer<typeof schema>;

type CreateProjectFormProps = {
  fields?: ProjectRequestFieldConfig[];
};

export function CreateProjectForm({ fields }: CreateProjectFormProps) {
  const [isPending, startTransition] = useTransition();
  const { control, register, handleSubmit, reset, formState, setError } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        title: "",
        description: "",
        justification: "",
        priority: ProjectPriority.MEDIUM,
        customFields: {},
      },
    });
  const orderedFields = (fields?.length ? fields : PROJECT_REQUEST_FIELDS).sort(
    (a, b) => a.order - b.order,
  );
  const optionFieldTypes = new Set(["SELECT", "MULTI_SELECT", "RADIO"]);
  const parseOptions = (value: string | null | undefined) =>
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const parseMultiValue = (value: string | undefined) => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };
  const isEmptyCustomValue = (
    field: ProjectRequestFieldConfig,
    value: string | undefined,
  ) => {
    if (field.fieldType === "MULTI_SELECT") {
      return parseMultiValue(value).length === 0;
    }

    return !value?.trim();
  };

  const onSubmit = handleSubmit((values) => {
    const missingCustom = orderedFields.filter(
      (field) =>
        !field.isSystem &&
        field.isActive &&
        field.required &&
        isEmptyCustomValue(field, values.customFields?.[field.id]),
    );

    if (missingCustom.length) {
      missingCustom.forEach((field) => {
        setError(`customFields.${field.id}` as const, {
          type: "required",
          message: "Campo obrigatorio",
        });
      });
      return;
    }

    startTransition(async () => {
      const result = await createProject(values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("solicitação criada.");
      reset();
    });
  });

  return (
    <Form onSubmit={onSubmit} className="grid gap-4">
      {orderedFields.map((field) => {
        if (field.key === "priority") {
          return null;
        }

        if (!field.isActive) {
          return null;
        }

        const options = optionFieldTypes.has(field.fieldType)
          ? parseOptions(field.options)
          : [];
        const systemKey = (field.key ?? "title") as
          | "title"
          | "description"
          | "justification";
        const error = field.isSystem
          ? formState.errors[systemKey]
          : formState.errors.customFields?.[field.id];
        const fieldId = field.key ?? `custom-${field.id}`;
        const registerName = field.isSystem
          ? (field.key as "title" | "description" | "justification")
          : (`customFields.${field.id}` as const);

        return (
          <div key={field.id} className="grid gap-2">
            <Label htmlFor={fieldId}>{field.label}</Label>
            {field.fieldType === "LONG_TEXT" ? (
              <Textarea
                id={fieldId}
                placeholder={field.placeholder}
                {...register(registerName)}
              />
            ) : null}
            {field.fieldType === "TEXT" ? (
              <Input
                id={fieldId}
                placeholder={field.placeholder}
                {...register(registerName)}
              />
            ) : null}
            {field.fieldType === "DATE" ? (
              <Controller
                control={control}
                name={registerName}
                render={({ field: controlField }) => (
                  <Input
                    id={fieldId}
                    type="date"
                    value={controlField.value ?? ""}
                    onChange={(event) =>
                      controlField.onChange(event.target.value)
                    }
                  />
                )}
              />
            ) : null}
            {field.fieldType === "SELECT" ? (
              <Controller
                control={control}
                name={registerName}
                render={({ field: controlField }) => (
                  <div className="grid gap-2">
                    <Select
                      value={controlField.value ?? ""}
                      onValueChange={controlField.onChange}
                    >
                      <SelectTrigger id={fieldId}>
                        <SelectValue placeholder={field.placeholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!options.length ? (
                      <span className="text-xs text-muted-foreground">
                        Nenhuma opcao configurada.
                      </span>
                    ) : null}
                  </div>
                )}
              />
            ) : null}
            {field.fieldType === "RADIO" ? (
              <Controller
                control={control}
                name={registerName}
                render={({ field: controlField }) => (
                  <div className="grid gap-2">
                    {options.map((option) => (
                      <label
                        key={option}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="radio"
                          name={fieldId}
                          value={option}
                          checked={controlField.value === option}
                          onChange={() => controlField.onChange(option)}
                          className="h-4 w-4 rounded-full border border-input text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                    {!options.length ? (
                      <span className="text-xs text-muted-foreground">
                        Nenhuma opcao configurada.
                      </span>
                    ) : null}
                  </div>
                )}
              />
            ) : null}
            {field.fieldType === "MULTI_SELECT" ? (
              <Controller
                control={control}
                name={registerName}
                render={({ field: controlField }) => {
                  const selected = parseMultiValue(controlField.value);

                  return (
                    <div className="grid gap-2">
                      {options.map((option) => {
                        const isChecked = selected.includes(option);
                        return (
                          <label
                            key={option}
                            className="flex items-center gap-2 text-sm"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const next = isChecked
                                  ? selected.filter((item) => item !== option)
                                  : [...selected, option];
                                controlField.onChange(
                                  next.length ? JSON.stringify(next) : "",
                                );
                              }}
                              className="h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                      {!options.length ? (
                        <span className="text-xs text-muted-foreground">
                          Nenhuma opcao configurada.
                        </span>
                      ) : null}
                    </div>
                  );
                }}
              />
            ) : null}
            {field.helperText ? (
              <span className="text-xs text-muted-foreground">
                {field.helperText}
              </span>
            ) : null}
            {error ? (
              <span className="text-xs text-destructive">{error.message}</span>
            ) : null}
          </div>
        );
      })}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Enviando" : "Criar solicitação"}
      </Button>
    </Form>
  );
}
