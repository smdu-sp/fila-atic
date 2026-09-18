// Rules for the free-form fields of a task. Pure, so forms and actions agree.

export const MAX_LABELS = 8;
export const MAX_LABEL_LENGTH = 30;
export const MAX_COMMENT_LENGTH = 4000;

export const LABELS_ERROR = `Etiquetas invalidas (ate ${MAX_LABELS}, com ate ${MAX_LABEL_LENGTH} caracteres cada)`;

// Trims, collapses spaces, drops empties and repeats (case-insensitive, the
// first spelling wins). Fails when there are too many or one is too long.
export function normalizeLabels(
  input: unknown,
): { ok: true; value: string[] } | { ok: false } {
  if (!Array.isArray(input)) return { ok: false };

  const seen = new Set<string>();
  const labels: string[] = [];

  for (const raw of input) {
    if (typeof raw !== "string") return { ok: false };

    const label = raw.trim().replace(/\s+/g, " ");
    if (!label) continue;
    if (label.length > MAX_LABEL_LENGTH) return { ok: false };

    const key = label.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    labels.push(label);
  }

  return labels.length > MAX_LABELS ? { ok: false } : { ok: true, value: labels };
}

// "api, banco de dados" -> ["api", "banco de dados"]
export const parseLabelsText = (text: string) =>
  text.split(",").map((part) => part.trim()).filter(Boolean);
