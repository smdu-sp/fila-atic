import { prisma } from "@/lib/prisma";
import {
  PROJECT_REQUEST_FIELDS,
  type ProjectRequestFieldConfig,
  type ProjectRequestFieldKey,
  type RequestFieldType,
} from "@/lib/requestForm";

function mergeDefaults(
  rows: Array<ProjectRequestFieldConfig>,
): ProjectRequestFieldConfig[] {
  const systemRows = rows.filter((row) => row.isSystem && row.key);
  const customRows = rows.filter((row) => !row.isSystem);
  const byKey = new Map<ProjectRequestFieldKey, ProjectRequestFieldConfig>(
    systemRows.map((row) => [row.key as ProjectRequestFieldKey, row]),
  );

  const systemFields = PROJECT_REQUEST_FIELDS.map((field) => ({
    ...field,
    ...byKey.get(field.key as ProjectRequestFieldKey),
  }));

  return [...systemFields, ...customRows].sort((a, b) => a.order - b.order);
}

// No authentication here: callers (server actions and the public form page)
// decide who may see the configuration.
export async function loadRequestFields(options?: {
  includeInactive?: boolean;
}): Promise<ProjectRequestFieldConfig[]> {
  const rows = await prisma.projectRequestField.findMany({
    select: {
      id: true,
      key: true,
      label: true,
      placeholder: true,
      helperText: true,
      order: true,
      isSystem: true,
      fieldType: true,
      options: true,
      required: true,
      isActive: true,
    },
    orderBy: { order: "asc" },
  });

  const mapped = rows.map((row) => ({
    id: row.id,
    key: row.key as ProjectRequestFieldKey | null,
    label: row.label,
    placeholder: row.placeholder,
    helperText: row.helperText,
    order: row.order,
    isSystem: row.isSystem,
    fieldType: row.fieldType as RequestFieldType,
    options: row.options,
    required: row.required,
    isActive: row.isActive,
  }));

  return mergeDefaults(
    options?.includeInactive ? mapped : mapped.filter((row) => row.isActive),
  );
}
