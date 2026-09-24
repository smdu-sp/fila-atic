import { prisma } from "@/lib/prisma";
import { matchPalette } from "@/lib/labels";

// Checks the labels a task wants against the palette and returns them with the
// palette spelling. A label nobody registered is an error naming the culprits.
export async function resolveTaskLabels(
  requested: string[],
): Promise<{ ok: true; value: string[] } | { ok: false; error: string }> {
  if (!requested.length) return { ok: true, value: [] };

  const palette = await prisma.label.findMany({ select: { name: true } });
  const { names, unknown } = matchPalette(
    requested,
    palette.map((label) => label.name),
  );

  return unknown.length
    ? {
        ok: false,
        error: `Etiqueta nao cadastrada: ${unknown.join(", ")}. Peça a coordenação para cadastrá-la.`,
      }
    : { ok: true, value: names };
}
