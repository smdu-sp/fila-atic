"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { normalizeHexColor } from "@/lib/labelColors";
import { LABEL_NAME_ERROR, normalizeLabelName } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { isCoordination, isStaffRole } from "@/lib/roles";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type LabelItem = {
  id: string;
  name: string;
  color: string;
  // tasks using it
  taskCount: number;
};

const COLOR_ERROR = "Cor invalida (use o formato #rrggbb)";

function refresh() {
  revalidatePath("/kanban");
  revalidatePath("/projetos");
  revalidatePath("/solicitacoes/[id]", "page");
  revalidatePath("/administracao/etiquetas");
}

async function requireCoordination(): Promise<
  { success: true } | { success: false; error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!isCoordination(user.role)) {
    return { success: false, error: "Sem permissao" };
  }
  return { success: true };
}

// Another label whose name only differs in case (ignoring `exceptId`).
async function findNameClash(name: string, exceptId?: string) {
  return prisma.label.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
}

// The whole palette, alphabetical. Everyone who can use tasks may read it.
export async function listLabels(): Promise<ActionResult<LabelItem[]>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!isStaffRole(user.role)) return { success: false, error: "Sem permissao" };

  const [labels, usage] = await Promise.all([
    prisma.label.findMany({ orderBy: { name: "asc" } }),
    prisma.$queryRaw<{ name: string; total: bigint }[]>`
      SELECT tag AS name, count(*) AS total
      FROM "Task", unnest("labels") AS tag
      GROUP BY tag`,
  ]);
  const counts = new Map(usage.map((row) => [row.name, Number(row.total)]));

  return {
    success: true,
    data: labels
      // accent-aware, case-insensitive order (the database collation is not)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      .map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        taskCount: counts.get(label.name) ?? 0,
      })),
  };
}

export async function createLabel(input: {
  name: string;
  color: string;
}): Promise<ActionResult<string>> {
  const auth = await requireCoordination();
  if (!auth.success) return auth;

  const name = normalizeLabelName(input.name);
  if (!name) return { success: false, error: LABEL_NAME_ERROR };

  const color = normalizeHexColor(input.color);
  if (!color) return { success: false, error: COLOR_ERROR };

  if (await findNameClash(name)) {
    return { success: false, error: "Ja existe uma etiqueta com esse nome" };
  }

  const label = await prisma.label.create({ data: { name, color } });

  refresh();
  return { success: true, data: label.id };
}

// Renaming carries the tasks along; recoloring only touches the palette.
export async function updateLabel(input: {
  id: string;
  name?: string;
  color?: string;
}): Promise<ActionResult<void>> {
  const auth = await requireCoordination();
  if (!auth.success) return auth;

  const current = await prisma.label.findUnique({ where: { id: input.id } });
  if (!current) return { success: false, error: "Etiqueta nao encontrada" };

  let name = current.name;
  if (input.name !== undefined) {
    const normalized = normalizeLabelName(input.name);
    if (!normalized) return { success: false, error: LABEL_NAME_ERROR };
    name = normalized;
  }

  let color = current.color;
  if (input.color !== undefined) {
    const normalized = normalizeHexColor(input.color);
    if (!normalized) return { success: false, error: COLOR_ERROR };
    color = normalized;
  }

  if (name !== current.name && (await findNameClash(name, current.id))) {
    return { success: false, error: "Ja existe uma etiqueta com esse nome" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.label.update({ where: { id: current.id }, data: { name, color } });

    if (name !== current.name) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Task"
        SET "labels" = array_replace("labels", ${current.name}, ${name})
        WHERE ${current.name} = ANY("labels")`);
    }
  });

  refresh();
  return { success: true, data: undefined };
}

// Takes the label off every task that carries it, then removes it.
export async function deleteLabel(id: string): Promise<ActionResult<void>> {
  const auth = await requireCoordination();
  if (!auth.success) return auth;

  const current = await prisma.label.findUnique({ where: { id } });
  if (!current) return { success: false, error: "Etiqueta nao encontrada" };

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Task"
      SET "labels" = array_remove("labels", ${current.name})
      WHERE ${current.name} = ANY("labels")`);
    await tx.label.delete({ where: { id } });
  });

  refresh();
  return { success: true, data: undefined };
}
