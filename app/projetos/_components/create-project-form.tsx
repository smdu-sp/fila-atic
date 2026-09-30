"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ProjectPriority } from "@prisma/client";

import { createProject } from "@/actions/projectActions";
import { submitPublicRequestForm } from "@/actions/publicRequestActions";
import { addRequestAttachments } from "@/actions/requestLifecycleActions";
import { RequestField } from "@/app/projetos/_components/request-field";
import { EmojiInput } from "@/components/emoji-picker";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  PROJECT_REQUEST_FIELDS,
  type ProjectRequestFieldConfig,
} from "@/lib/requestForm";
import {
  fieldsForStep,
  missingRequiredFields,
  validateGuestIdentity,
  wizardSteps,
  type WizardStepId,
} from "@/lib/requestWizard";

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

export type RequestFormValues = z.infer<typeof schema>;

type CreateProjectFormProps = {
  fields?: ProjectRequestFieldConfig[];
  // Public form: asks who the requester is and confirms by e-mail.
  guest?: boolean;
  allowedDomains?: string[];
};

const STEP_TITLE: Record<WizardStepId, string> = {
  intro: "Antes de começar",
  identity: "Suas informações",
  basics: "Dados da solicitação",
  details: "Detalhes",
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
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const clearFiles = () => {
    setFiles([]);
    setFileInputKey((key) => key + 1);
  };

  const { control, register, handleSubmit, reset, formState, setError, clearErrors, getValues, trigger } =
    useForm<RequestFormValues>({
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

  const orderedFields = fields?.length ? fields : PROJECT_REQUEST_FIELDS;
  const basicFields = fieldsForStep(orderedFields, 3);
  const detailFields = fieldsForStep(orderedFields, 4);

  const steps = wizardSteps(guest);
  const stepId = steps[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;

  const goTo = (index: number) => {
    setDirection(index > stepIndex ? "forward" : "backward");
    setStepIndex(index);
  };

  // setError leaves the message up until something clears it — a field that
  // was invalid on the last check and is now fine would otherwise keep
  // showing its old error forever.
  const validateGuestFields = () => {
    clearErrors(["guestName", "guestEmail", "guestDepartment"]);
    const errors = validateGuestIdentity(
      {
        name: getValues("guestName") ?? "",
        email: getValues("guestEmail") ?? "",
        department: getValues("guestDepartment") ?? "",
      },
      allowedDomains,
    );

    if (errors.name) setError("guestName", { message: errors.name });
    if (errors.email) setError("guestEmail", { message: errors.email });
    if (errors.department) setError("guestDepartment", { message: errors.department });
    return Object.keys(errors).length === 0;
  };

  const validateStepFields = async (list: ProjectRequestFieldConfig[]) => {
    const zodNames = list.filter((field) => field.isSystem).map((field) => field.key!);
    const zodOk = zodNames.length ? await trigger(zodNames as Array<keyof RequestFormValues>) : true;

    // same "clear before re-checking" reasoning as validateGuestFields
    clearErrors(list.filter((field) => !field.isSystem).map((field) => `customFields.${field.id}` as const));
    const missing = missingRequiredFields(list, (fieldId) => getValues(`customFields.${fieldId}`));
    missing.forEach((field) =>
      setError(`customFields.${field.id}` as const, { type: "required", message: "Campo obrigatório" }),
    );
    return zodOk && missing.length === 0;
  };

  // Only steps with a real form on them need to pass something before
  // advancing; "intro" has nothing to check.
  const goNext = async () => {
    if (stepId === "identity" && !validateGuestFields()) return;

    if (stepId === "basics" || stepId === "details") {
      const ok = await validateStepFields(stepId === "basics" ? basicFields : detailFields);
      if (!ok) return;
    }

    goTo(stepIndex + 1);
  };

  const resetWizard = () => {
    clearFiles();
    reset();
    setStepIndex(0);
  };

  const onSubmit = handleSubmit((values) => {
    // final safety net: re-check every step's required custom fields, not
    // just the one that was current (values persist across steps, but a
    // field on an earlier step could in principle have been left empty)
    const allFields = [...basicFields, ...detailFields];
    clearErrors(
      allFields.filter((field) => !field.isSystem).map((field) => `customFields.${field.id}` as const),
    );
    const missingCustom = missingRequiredFields(allFields, (fieldId) => values.customFields?.[fieldId]);
    let hasError = missingCustom.length > 0;
    missingCustom.forEach((field) =>
      setError(`customFields.${field.id}` as const, { type: "required", message: "Campo obrigatório" }),
    );

    if (guest && !validateGuestFields()) hasError = true;
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
        resetWizard();
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
          toast.error(`Solicitação criada, mas os anexos não foram enviados: ${uploaded.error}`);
        }
      }

      toast.success("solicitação criada.");
      resetWizard();
    });
  });

  if (sentTo) {
    return (
      <div className="grid gap-3 text-sm" role="status">
        <p className="text-base font-semibold">Confirme seu e-mail</p>
        <p>
          Enviamos uma mensagem para <strong>{sentTo}</strong>. Abra o link recebido para confirmar e
          registrar sua solicitação na fila. O link vale por 24 horas.
        </p>
        <p className="text-muted-foreground">
          Não recebeu? Verifique a caixa de spam ou envie o formulário novamente.
        </p>
        <Button type="button" variant="outline" onClick={() => setSentTo(null)}>
          Enviar outra solicitação
        </Button>
      </div>
    );
  }

  const animationClass =
    direction === "forward"
      ? "animate-in fade-in-0 slide-in-from-right-6 duration-300"
      : "animate-in fade-in-0 slide-in-from-left-6 duration-300";

  return (
    <Form
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        // Enter inside a single-line field must not jump straight to
        // submitting the whole request from an earlier step.
        if (event.key === "Enter" && !isLastStep && event.target instanceof HTMLInputElement) {
          event.preventDefault();
        }
      }}
      className="grid gap-5"
    >
      <div className="grid gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Etapa {stepIndex + 1} de {steps.length}
          </span>
          <span className="font-medium text-foreground">{STEP_TITLE[stepId]}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {guest ? (
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Não preencha este campo</label>
          <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
        </div>
      ) : null}

      <div key={stepIndex} className={cn("grid min-w-0 gap-4", animationClass)}>
        {stepId === "intro" ? (
          <div className="grid gap-3 text-sm text-muted-foreground">
            <p>
              Este formulário tem {steps.length} etapas rápidas. Quanto mais detalhes você der sobre o
              que precisa e por quê, mais fácil fica para a equipe entender e priorizar o seu pedido.
            </p>
            <p>
              Descreva o problema ou a necessidade com clareza, explique o impacto ou a urgência, e — se
              tiver — anexe prints, documentos ou outros arquivos que ajudem a explicar a solicitação;
              isso entra na última etapa.
            </p>
            {guest ? (
              <p>
                Como você ainda não tem uma conta, vamos pedir seu nome e e-mail institucional na
                próxima etapa, para confirmar e avisar sobre o andamento.
              </p>
            ) : null}
          </div>
        ) : null}

        {stepId === "identity" ? (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="guestName">Nome</Label>
              <EmojiInput
                id="guestName"
                placeholder="Seu nome completo"
                autoComplete="name"
                {...register("guestName")}
              />
              {formState.errors.guestName ? (
                <span className="text-xs text-destructive">{formState.errors.guestName.message}</span>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="guestEmail">E-mail institucional</Label>
              <Input
                id="guestEmail"
                type="email"
                placeholder={allowedDomains.length ? `nome@${allowedDomains[0]}` : "nome@dominio.gov.br"}
                autoComplete="email"
                {...register("guestEmail")}
              />
              {formState.errors.guestEmail ? (
                <span className="text-xs text-destructive">{formState.errors.guestEmail.message}</span>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="guestDepartment">Setor / unidade</Label>
              <EmojiInput
                id="guestDepartment"
                placeholder="Onde você trabalha"
                autoComplete="organization"
                {...register("guestDepartment")}
              />
              {formState.errors.guestDepartment ? (
                <span className="text-xs text-destructive">{formState.errors.guestDepartment.message}</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {stepId === "basics" ? (
          <div className="grid gap-4">
            {basicFields.map((field) => (
              <RequestField key={field.id} field={field} control={control} register={register} errors={formState.errors} />
            ))}
          </div>
        ) : null}

        {stepId === "details" ? (
          <div className="grid gap-4">
            {detailFields.map((field) => (
              <RequestField key={field.id} field={field} control={control} register={register} errors={formState.errors} />
            ))}
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
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        {!isFirstStep ? (
          <Button type="button" variant="ghost" onClick={() => goTo(stepIndex - 1)} disabled={isPending}>
            Voltar
          </Button>
        ) : (
          <span />
        )}
        {isLastStep ? (
          <Button type="submit" disabled={isPending} className={guest ? "flex-1 sm:flex-none" : undefined}>
            {isPending ? "Enviando" : guest ? "Enviar solicitação" : "Criar solicitação"}
          </Button>
        ) : (
          <Button type="button" onClick={goNext} className={stepId === "intro" ? "flex-1 sm:flex-none" : undefined}>
            {stepId === "intro" ? "Começar" : "Avançar"}
          </Button>
        )}
      </div>
    </Form>
  );
}
