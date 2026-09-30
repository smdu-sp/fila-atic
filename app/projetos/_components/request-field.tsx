"use client";

import { Controller, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";

import { EmojiTextarea } from "@/components/emoji-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseMultiValue, parseOptions, type ProjectRequestFieldConfig } from "@/lib/requestForm";

import type { RequestFormValues } from "@/app/projetos/_components/create-project-form";

const OPTION_FIELD_TYPES = new Set(["SELECT", "MULTI_SELECT", "RADIO"]);

// One field of the request wizard (a system one — title, description,
// justification — or a coordinator-defined custom one), for step 3 ("Dados
// da solicitação") and step 4 ("Detalhes"). Kept apart from the wizard itself
// so both steps render fields the exact same way.
export function RequestField({
  field,
  control,
  register,
  errors,
}: {
  field: ProjectRequestFieldConfig;
  control: Control<RequestFormValues>;
  register: UseFormRegister<RequestFormValues>;
  errors: FieldErrors<RequestFormValues>;
}) {
  const options = OPTION_FIELD_TYPES.has(field.fieldType) ? parseOptions(field.options) : [];
  const fieldId = field.key ?? `custom-${field.id}`;
  const registerName = field.isSystem
    ? (field.key as "title" | "description" | "justification")
    : (`customFields.${field.id}` as const);
  const error = field.isSystem
    ? errors[registerName as "title" | "description" | "justification"]
    : errors.customFields?.[field.id];

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId}>{field.label}</Label>
      {field.fieldType === "LONG_TEXT" ? (
        <EmojiTextarea id={fieldId} rows={5} placeholder={field.placeholder} {...register(registerName)} />
      ) : null}
      {field.fieldType === "TEXT" ? (
        <Input id={fieldId} placeholder={field.placeholder} {...register(registerName)} />
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
              onChange={(event) => controlField.onChange(event.target.value)}
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
              <Select value={controlField.value ?? ""} onValueChange={controlField.onChange}>
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
                <span className="text-xs text-muted-foreground">Nenhuma opção configurada.</span>
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
                <label key={option} className="flex items-center gap-2 text-sm">
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
                <span className="text-xs text-muted-foreground">Nenhuma opção configurada.</span>
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
                    <label key={option} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = isChecked
                            ? selected.filter((item) => item !== option)
                            : [...selected, option];
                          controlField.onChange(next.length ? JSON.stringify(next) : "");
                        }}
                        className="h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
                {!options.length ? (
                  <span className="text-xs text-muted-foreground">Nenhuma opção configurada.</span>
                ) : null}
              </div>
            );
          }}
        />
      ) : null}
      {field.helperText ? <span className="text-xs text-muted-foreground">{field.helperText}</span> : null}
      {error ? <span className="text-xs text-destructive">{error.message as string}</span> : null}
    </div>
  );
}
