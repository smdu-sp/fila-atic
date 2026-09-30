"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createProjectRequestField,
  deleteProjectRequestField,
  updateProjectRequestFields,
} from "@/actions/requestFormActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REQUEST_FORM_STEPS, type ProjectRequestFieldConfig } from "@/lib/requestForm";

type RequestFormSettingsProps = {
  fields: ProjectRequestFieldConfig[];
};

export function RequestFormSettings({ fields }: RequestFormSettingsProps) {
  const [items, setItems] = useState(fields);
  const [isPending, startTransition] = useTransition();
  const optionFieldTypes = new Set(["SELECT", "MULTI_SELECT", "RADIO"]);

  const normalizeOptions = (value: string | null | undefined) =>
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const updateField = (
    id: ProjectRequestFieldConfig["id"],
    patch: Partial<ProjectRequestFieldConfig>,
  ) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const handleAdd = () => {
    startTransition(async () => {
      const result = await createProjectRequestField();
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setItems((prev) => [...prev, result.data]);
    });
  };

  const handleRemove = (fieldId: string) => {
    startTransition(async () => {
      const result = await deleteProjectRequestField(fieldId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      setItems((prev) => prev.filter((item) => item.id !== fieldId));
    });
  };

  const handleSave = () => {
    const missingOptions = items.filter(
      (field) =>
        !field.isSystem &&
        field.isActive &&
        optionFieldTypes.has(field.fieldType) &&
        normalizeOptions(field.options).length === 0,
    );

    if (missingOptions.length) {
      toast.error("Informe pelo menos uma opcao para os selects e radios.");
      return;
    }

    startTransition(async () => {
      const result = await updateProjectRequestFields(items);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Configuracao atualizada.");
    });
  };

  return (
    <div className="space-y-4">
      {items.map((field) => (
        <div
          key={field.id}
          className="rounded-lg border border-border/60 bg-background p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {field.isSystem ? "Campo base" : "Campo personalizado"}
            </p>
            {!field.isSystem ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(field.id)}
                disabled={isPending}
              >
                Remover
              </Button>
            ) : null}
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`${field.id}-label`}>Rotulo</Label>
              <Input
                id={`${field.id}-label`}
                value={field.label}
                onChange={(event) =>
                  updateField(field.id, { label: event.target.value })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${field.id}-placeholder`}>Placeholder</Label>
              <Input
                id={`${field.id}-placeholder`}
                value={field.placeholder}
                onChange={(event) =>
                  updateField(field.id, { placeholder: event.target.value })
                }
              />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor={`${field.id}-helper`}>Texto de apoio</Label>
              <Input
                id={`${field.id}-helper`}
                value={field.helperText ?? ""}
                onChange={(event) =>
                  updateField(field.id, { helperText: event.target.value })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${field.id}-order`}>Ordem</Label>
              <Input
                id={`${field.id}-order`}
                type="number"
                min={1}
                value={field.order}
                onChange={(event) =>
                  updateField(field.id, {
                    order: Number(event.target.value || field.order),
                  })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${field.id}-step`}>Etapa no formulário</Label>
              <Select
                value={String(field.step)}
                onValueChange={(value) =>
                  updateField(field.id, { step: Number(value) as 3 | 4 })
                }
              >
                <SelectTrigger id={`${field.id}-step`}>
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_FORM_STEPS.map((step) => (
                    <SelectItem key={step.value} value={String(step.value)}>
                      {step.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${field.id}-type`}>Tipo</Label>
              <Select
                value={field.fieldType}
                onValueChange={(value) =>
                  updateField(field.id, {
                    fieldType: value as ProjectRequestFieldConfig["fieldType"],
                    options: optionFieldTypes.has(
                      value as ProjectRequestFieldConfig["fieldType"],
                    )
                      ? field.options
                      : null,
                  })
                }
                disabled={field.isSystem}
              >
                <SelectTrigger id={`${field.id}-type`}>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">Texto</SelectItem>
                  <SelectItem value="LONG_TEXT">Texto longo</SelectItem>
                  <SelectItem value="SELECT">Select</SelectItem>
                  <SelectItem value="MULTI_SELECT">Multiselect</SelectItem>
                  <SelectItem value="RADIO">Radio</SelectItem>
                  <SelectItem value="DATE">Data</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {optionFieldTypes.has(field.fieldType) ? (
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor={`${field.id}-options`}>Opcoes</Label>
                <Input
                  id={`${field.id}-options`}
                  value={field.options ?? ""}
                  onChange={(event) =>
                    updateField(field.id, { options: event.target.value })
                  }
                  placeholder="Ex: Opcao 1, Opcao 2, Opcao 3"
                  disabled={field.isSystem}
                />
                <span className="text-xs text-muted-foreground">
                  Separe as opcoes com virgula.
                </span>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor={`${field.id}-required`}>Obrigatorio</Label>
              <Select
                value={field.required ? "yes" : "no"}
                onValueChange={(value) =>
                  updateField(field.id, { required: value === "yes" })
                }
                disabled={field.isSystem}
              >
                <SelectTrigger id={`${field.id}-required`}>
                  <SelectValue placeholder="Obrigatorio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Sim</SelectItem>
                  <SelectItem value="no">Nao</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={handleAdd}>
          Adicionar campo
        </Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? "Salvando" : "Salvar configuracao"}
        </Button>
      </div>
    </div>
  );
}
