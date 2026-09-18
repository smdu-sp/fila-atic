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

export type ProjectRequestFieldConfig = {
  id: string;
  key: ProjectRequestFieldKey | null;
  label: string;
  placeholder: string;
  helperText: string | null;
  order: number;
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
    isSystem: true,
    fieldType: "TEXT",
    options: null,
    required: false,
    isActive: false,
  },
];
