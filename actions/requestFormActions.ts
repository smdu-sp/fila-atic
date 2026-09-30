"use server";

import { revalidatePath } from "next/cache";

import { isCoordination } from "@/lib/roles";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  PROJECT_REQUEST_FIELDS,
  type ProjectRequestFieldConfig,
  type RequestFieldType,
} from "@/lib/requestForm";
import { loadRequestFields } from "@/lib/requestFormServer";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// Every page that renders CreateProjectForm (it reads the fields once, as a
// server-passed prop) plus the admin screen itself — without this, a saved
// change only shows up after Next's client router cache for these routes
// expires on its own, which felt like "it didn't save" even though it did.
function refresh() {
  revalidatePath("/solicitar");
  revalidatePath("/");
  revalidatePath("/projetos");
  revalidatePath("/administracao/solicitacao");
}

const fieldSchema = z.object({
  id: z.string().optional(),
  key: z.enum(["title", "description", "justification", "priority"]).nullable(),
  label: z.string().min(1, "Informe o rotulo"),
  placeholder: z.string().min(1, "Informe o placeholder"),
  helperText: z.string().nullable().optional(),
  order: z.number().int().min(1, "Informe a ordem"),
  step: z.union([z.literal(3), z.literal(4)]),
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

export async function listProjectRequestFields(options?: {
  includeInactive?: boolean;
}): Promise<ActionResult<ProjectRequestFieldConfig[]>> {
  if (!(await getCurrentUser())) {
    return { success: false, error: "Nao autenticado" };
  }

  return {
    success: true,
    data: await loadRequestFields(options),
  };
}

export async function createProjectRequestField(): Promise<
  ActionResult<ProjectRequestFieldConfig>
> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  if (!isCoordination(user.role)) {
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
      step: 3,
      isSystem: false,
      fieldType: "TEXT",
      options: null,
      required: false,
      isActive: true,
    },
  });

  refresh();

  return {
    success: true,
    data: {
      id: created.id,
      key: null,
      label: created.label,
      placeholder: created.placeholder,
      helperText: created.helperText,
      order: created.order,
      step: (created.step === 4 ? 4 : 3) as 3 | 4,
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

  if (!isCoordination(user.role)) {
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

  refresh();

  return { success: true, data: undefined };
}

export async function updateProjectRequestFields(
  input: ProjectRequestFieldConfig[],
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "Nao autenticado" };
  }

  if (!isCoordination(user.role)) {
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
          step: field.step,
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
          step: field.step,
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
          step: field.step,
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
        step: field.step,
        isSystem: false,
        fieldType: field.fieldType,
        options: field.options ?? null,
        required: field.required,
        isActive: field.isActive,
      },
    });
  });

  await prisma.$transaction(tasks);

  refresh();

  return { success: true, data: undefined };
}
