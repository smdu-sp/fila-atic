"use server";

import { z } from "zod";
import { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  PROJECT_REQUEST_FIELDS,
  type ProjectRequestFieldConfig,
  type ProjectRequestFieldKey,
  type RequestFieldType,
} from "@/lib/requestForm";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const fieldSchema = z.object({
  id: z.string().optional(),
  key: z.enum(["title", "description", "justification", "priority"]).nullable(),
  label: z.string().min(1, "Informe o rotulo"),
  placeholder: z.string().min(1, "Informe o placeholder"),
  helperText: z.string().nullable().optional(),
  order: z.number().int().min(1, "Informe a ordem"),
  isSystem: z.boolean(),
  fieldType: z.enum([
    "TEXT",
    "LONG_TEXT",
    "SELECT",
    "MULTI_SELECT",
    "RADIO",
    "DATE",
  ]),
  options: z.string().nullable().optional(),
  required: z.boolean(),
  isActive: z.boolean(),
});

const payloadSchema = z.array(fieldSchema).min(1);

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

export async function listProjectRequestFields(options?: {
  includeInactive?: boolean;
}): Promise<ActionResult<ProjectRequestFieldConfig[]>> {
  if (!(await getCurrentUser())) {
    return { success: false, error: "Nao autenticado" };
  }

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

  const filtered = options?.includeInactive
    ? mapped
    : mapped.filter((row) => row.isActive);

  return {
    success: true,
    data: mergeDefaults(filtered),
  };
}

export async function createProjectRequestField(): Promise<
  ActionResult<ProjectRequestFieldConfig>
> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  if (user.role !== Role.COORDINATOR) {
    return { success: false, error: "Sem permissao" };
  }

  const lastOrder = await prisma.projectRequestField.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const created = await prisma.projectRequestField.create({
    data: {
      key: null,
      label: "Novo campo",
      placeholder: "Digite aqui",
      helperText: null,
      order: (lastOrder?.order ?? PROJECT_REQUEST_FIELDS.length) + 1,
      isSystem: false,
      fieldType: "TEXT",
      options: null,
      required: false,
      isActive: true,
    },
  });

  return {
    success: true,
    data: {
      id: created.id,
      key: null,
      label: created.label,
      placeholder: created.placeholder,
      helperText: created.helperText,
      order: created.order,
      isSystem: created.isSystem,
      fieldType: created.fieldType as RequestFieldType,
      options: created.options,
      required: created.required,
      isActive: created.isActive,
    },
  };
}

export async function deleteProjectRequestField(
  fieldId: string,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  if (user.role !== Role.COORDINATOR) {
    return { success: false, error: "Sem permissao" };
  }

  if (!fieldId) {
    return { success: false, error: "Campo invalido" };
  }

  const field = await prisma.projectRequestField.findUnique({
    where: { id: fieldId },
    select: { isSystem: true },
  });

  if (!field) {
    return { success: false, error: "Campo nao encontrado" };
  }

  if (field.isSystem) {
    return { success: false, error: "Campo do sistema" };
  }

  await prisma.projectRequestField.delete({ where: { id: fieldId } });

  return { success: true, data: undefined };
}

export async function updateProjectRequestFields(
  input: ProjectRequestFieldConfig[],
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  if (user.role !== Role.COORDINATOR) {
    return { success: false, error: "Sem permissao" };
  }

  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Campos invalidos" };
  }

  const tasks = parsed.data.map((field) => {
    if (field.isSystem && field.key) {
      return prisma.projectRequestField.upsert({
        where: { key: field.key },
        create: {
          key: field.key,
          label: field.label,
          placeholder: field.placeholder,
          helperText: field.helperText ?? null,
          order: field.order,
          isSystem: true,
          fieldType: field.fieldType,
          options: field.options ?? null,
          required: field.required,
          isActive: field.isActive,
        },
        update: {
          label: field.label,
          placeholder: field.placeholder,
          helperText: field.helperText ?? null,
          order: field.order,
          fieldType: field.fieldType,
          options: field.options ?? null,
          required: field.required,
          isActive: field.isActive,
        },
      });
    }

    if (field.id) {
      return prisma.projectRequestField.update({
        where: { id: field.id },
        data: {
          label: field.label,
          placeholder: field.placeholder,
          helperText: field.helperText ?? null,
          order: field.order,
          fieldType: field.fieldType,
          options: field.options ?? null,
          required: field.required,
          isActive: field.isActive,
        },
      });
    }

    return prisma.projectRequestField.create({
      data: {
        key: null,
        label: field.label,
        placeholder: field.placeholder,
        helperText: field.helperText ?? null,
        order: field.order,
        isSystem: false,
        fieldType: field.fieldType,
        options: field.options ?? null,
        required: field.required,
        isActive: field.isActive,
      },
    });
  });

  await prisma.$transaction(tasks);

  return { success: true, data: undefined };
}
