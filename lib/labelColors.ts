// Colors of the label palette. Pure, so the admin form, the chips and the
// actions agree on what a valid color is.

export const DEFAULT_LABEL_COLOR = "#3b82f6";

// Suggestions shown in the color picker; any "#rrggbb" is accepted.
export const LABEL_COLOR_PRESETS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR.test(value);

// "#3B82F6" -> "#3b82f6"; anything else is null.
export const normalizeHexColor = (value: unknown): string | null =>
  isHexColor(value) ? value.toLowerCase() : null;

// Black or white, whichever reads better on top of the given color (WCAG
// relative luminance).
export function readableTextColor(hex: string): "#000000" | "#ffffff" {
  if (!isHexColor(hex)) return "#000000";

  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  // contrast against white (1.05 / (L + 0.05)) vs against black ((L + 0.05) / 0.05)
  return luminance > 0.179 ? "#000000" : "#ffffff";
}
