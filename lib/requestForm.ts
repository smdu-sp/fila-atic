export type ProjectRequestFieldKey =
  | "title"
  | "description"
  | "justification"
  | "priority";

export type RequestFieldType =
  | "TEXT"
  | "LONG_TEXT"
  | "SELECT"
  | "MULTI_SELECT"
  | "RADIO"
  | "DATE";

// The request wizard has 4 steps: 1 (intro, no fields), 2 (the guest's own
// name/e-mail/department — public form only, not configurable), 3 ("Dados da
// solicitação") and 4 ("Detalhes"). Only 3 and 4 ever apply to a field.
export type ConfigurableRequestStep = 3 | 4;

export const REQUEST_FORM_STEPS: Array<{ value: ConfigurableRequestStep; label: string }> = [
  { value: 3, label: "3 · Dados da solicitação" },
  { value: 4, label: "4 · Detalhes" },
];

export type ProjectRequestFieldConfig = {
  id: string;
  key: ProjectRequestFieldKey | null;
  label: string;
  placeholder: string;
  helperText: string | null;
  order: number;
  step: ConfigurableRequestStep;
  isSystem: boolean;
  fieldType: RequestFieldType;
  options: string | null;
  required: boolean;
  isActive: boolean;
};

export const PROJECT_REQUEST_FIELDS: ProjectRequestFieldConfig[] = [
  {
    id: "title",
    key: "title",
    label: "Titulo",
    placeholder: "Titulo",
    helperText: null,
    order: 1,
    step: 3,
    isSystem: true,
    fieldType: "TEXT",
    options: null,
    required: true,
    isActive: true,
  },
  {
    id: "description",
    key: "description",
    label: "Descricao",
    placeholder: "Descricao",
    helperText: null,
    order: 2,
    step: 4,
    isSystem: true,
    fieldType: "LONG_TEXT",
    options: null,
    required: true,
    isActive: true,
  },
  {
    id: "justification",
    key: "justification",
    label: "Justificativa",
    placeholder: "Justificativa",
    helperText: null,
    order: 3,
    step: 4,
    isSystem: true,
    fieldType: "LONG_TEXT",
    options: null,
    required: true,
    isActive: true,
  },
  {
    id: "priority",
    key: "priority",
    label: "Prioridade",
    placeholder: "Prioridade",
    helperText: null,
    order: 4,
    step: 3,
    isSystem: true,
    fieldType: "TEXT",
    options: null,
    required: false,
    isActive: false,
  },
];

export function parseMultiValue(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function parseOptions(value?: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasCustomValue(fieldType: string, value?: string) {
  if (fieldType === "MULTI_SELECT") {
    return parseMultiValue(value).length > 0;
  }

  return Boolean(value?.trim());
}
