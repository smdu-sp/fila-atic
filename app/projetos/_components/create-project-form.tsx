"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ProjectPriority } from "@prisma/client";

import { createProject } from "@/actions/projectActions";
import { submitPublicRequestForm } from "@/actions/publicRequestActions";
import { addRequestAttachments } from "@/actions/requestLifecycleActions";
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
  // Public form only (guest mode).
  guestName: z.string().optional(),
  guestEmail: z.string().optional(),
  guestDepartment: z.string().optional(),
  website: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type CreateProjectFormProps = {
  fields?: ProjectRequestFieldConfig[];
  // Public form: asks who the requester is and confirms by e-mail.
  guest?: boolean;
  allowedDomains?: string[];
};

export function CreateProjectForm({
  fields,
  guest = false,
  allowedDomains = [],
}: CreateProjectFormProps) {
  const [isPending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  // remounting the (uncontrolled) file input is how it gets emptied
  const [fileInputKey, setFileInputKey] = useState(0);
  const clearFiles = () => {
    setFiles([]);
    setFileInputKey((key) => key + 1);
  };
  const { control, register, handleSubmit, reset, formState, setError } =
    useForm<FormValues>({
      resolver: zodResolver(schema),
      defaultValues: {
        title: "",
        description: "",
        justification: "",
        priority: ProjectPriority.MEDIUM,
        customFields: {},
        guestName: "",
        guestEmail: "",
        guestDepartment: "",
        website: "",
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

    let hasError = false;

    if (guest) {
      const name = values.guestName?.trim() ?? "";
      const email = values.guestEmail?.trim().toLowerCase() ?? "";
      const department = values.guestDepartment?.trim() ?? "";

      if (name.length < 3) {
        setError("guestName", { message: "Informe seu nome" });
        hasError = true;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError("guestEmail", { message: "Informe um e-mail valido" });
        hasError = true;
      } else if (
        allowedDomains.length &&
        !allowedDomains.includes(email.split("@")[1])
      ) {
        setError("guestEmail", {
          message: `Use seu e-mail institucional (${allowedDomains
            .map((domain) => `@${domain}`)
            .join(", ")})`,
        });
        hasError = true;
      }
      if (department.length < 2) {
        setError("guestDepartment", { message: "Informe seu setor" });
        hasError = true;
      }
    }

    if (missingCustom.length) {
      missingCustom.forEach((field) => {
        setError(`customFields.${field.id}` as const, {
          type: "required",
          message: "Campo obrigatorio",
        });
      });
      hasError = true;
    }

    if (hasError) return;

    if (guest) {
      startTransition(async () => {
        const data = new FormData();
        data.set(
          "payload",
          JSON.stringify({
            name: values.guestName ?? "",
            email: values.guestEmail ?? "",
            department: values.guestDepartment ?? "",
            title: values.title,
            description: values.description,
            justification: values.justification,
            customFields: values.customFields,
            website: values.website,
          }),
        );
        files.forEach((file) => data.append("attachments", file));
        const result = await submitPublicRequestForm(data);

        if (!result.success) {
          toast.error(result.error);
          return;
        }

        setSentTo(result.data.email);
        clearFiles();
        reset();
      });
      return;
    }

    startTransition(async () => {
      const result = await createProject(values);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (files.length) {
        const upload = new FormData();
        upload.set("projectId", result.data);
        files.forEach((file) => upload.append("attachments", file));
        const uploaded = await addRequestAttachments(upload);
        if (!uploaded.success) {
          toast.error(
            `Solicitação criada, mas os anexos não foram enviados: ${uploaded.error}`,
          );
        }
      }

      toast.success("solicitação criada.");
      clearFiles();
      reset();
    });
  });

  if (sentTo) {
    return (
      <div className="grid gap-3 text-sm" role="status">
        <p className="text-base font-semibold">Confirme seu e-mail</p>
        <p>
          Enviamos uma mensagem para <strong>{sentTo}</strong>. Abra o link
          recebido para confirmar e registrar sua solicitação na fila. O link
          vale por 24 horas.
        </p>
        <p className="text-muted-foreground">
          Não recebeu? Verifique a caixa de spam ou envie o formulário
          novamente.
        </p>
        <Button type="button" variant="outline" onClick={() => setSentTo(null)}>
          Enviar outra solicitação
        </Button>
      </div>
    );
  }

  return (
    <Form onSubmit={onSubmit} className="relative grid gap-4">
      {guest ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="guestName">Nome</Label>
            <Input
              id="guestName"
              placeholder="Seu nome completo"
              autoComplete="name"
              {...register("guestName")}
            />
            {formState.errors.guestName ? (
              <span className="text-xs text-destructive">
                {formState.errors.guestName.message}
              </span>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="guestEmail">E-mail institucional</Label>
            <Input
              id="guestEmail"
              type="email"
              placeholder={
                allowedDomains.length
                  ? `nome@${allowedDomains[0]}`
                  : "nome@dominio.gov.br"
              }
              autoComplete="email"
              {...register("guestEmail")}
            />
            {formState.errors.guestEmail ? (
              <span className="text-xs text-destructive">
                {formState.errors.guestEmail.message}
              </span>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="guestDepartment">Setor / unidade</Label>
            <Input
              id="guestDepartment"
              placeholder="Onde você trabalha"
              autoComplete="organization"
              {...register("guestDepartment")}
            />
            {formState.errors.guestDepartment ? (
              <span className="text-xs text-destructive">
                {formState.errors.guestDepartment.message}
              </span>
            ) : null}
          </div>
          <div
            aria-hidden="true"
            className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
          >
            <label htmlFor="website">Não preencha este campo</label>
            <input
              id="website"
              tabIndex={-1}
              autoComplete="off"
              {...register("website")}
            />
          </div>
        </>
      ) : null}
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
      <div className="grid gap-1.5">
        <Label htmlFor="request-files">Anexos (opcional)</Label>
        <Input
          id="request-files"
          key={fileInputKey}
          type="file"
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
        <span className="text-xs text-muted-foreground">
          Até 3 arquivos de 10 MB (PDF, imagens e documentos do Office).
        </span>
        {files.map((file, index) => (
          <div
            key={`${file.name}-${file.size}-${index}`}
            className="truncate rounded-lg border border-border/60 px-2 py-1 text-xs"
          >
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </div>
        ))}
      </div>
      <Button
        type="submit"
        disabled={isPending}
        className={guest ? "w-full" : "w-full sm:w-auto sm:justify-self-end"}
      >
        {isPending
          ? "Enviando"
          : guest
            ? "Enviar solicitação"
            : "Criar solicitação"}
      </Button>
    </Form>
  );
}
