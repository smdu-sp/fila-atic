// Rules for the managed label palette. Pure, so forms and actions agree.
import { MAX_LABEL_LENGTH } from "@/lib/taskFields";

export const LABEL_NAME_ERROR = `Informe um nome de ate ${MAX_LABEL_LENGTH} caracteres`;

// Trim + collapse spaces. Null when empty or too long.
export function normalizeLabelName(input: unknown): string | null {
  if (typeof input !== "string") return null;

  const name = input.trim().replace(/\s+/g, " ");
  return name && name.length <= MAX_LABEL_LENGTH ? name : null;
}

// Swaps each requested name for the palette spelling ("URGENTE" -> "Urgente").
// Names that are not in the palette come back in `unknown`.
export function matchPalette(
  requested: string[],
  palette: string[],
): { names: string[]; unknown: string[] } {
  const byKey = new Map(palette.map((name) => [name.toLowerCase(), name]));
  const names: string[] = [];
  const unknown: string[] = [];

  for (const raw of requested) {
    const match = byKey.get(raw.toLowerCase());
    if (match) names.push(match);
    else unknown.push(raw);
  }

  return { names, unknown };
}
