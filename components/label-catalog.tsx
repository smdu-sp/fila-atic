"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { readableTextColor } from "@/lib/labelColors";
import { cn } from "@/lib/utils";

export type CatalogLabel = { name: string; color: string };

type LabelCatalog = {
  labels: CatalogLabel[];
  // the coordination may register labels, the rest can only pick
  canManage: boolean;
};

const LabelCatalogContext = createContext<LabelCatalog>({
  labels: [],
  canManage: false,
});

// Hands the label palette to every chip and picker below, so the boards and
// dialogs do not have to pass it down prop by prop.
export function LabelCatalogProvider({
  labels,
  canManage = false,
  children,
}: {
  labels: CatalogLabel[];
  canManage?: boolean;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ labels, canManage }), [labels, canManage]);

  return (
    <LabelCatalogContext.Provider value={value}>
      {children}
    </LabelCatalogContext.Provider>
  );
}

export const useLabelCatalog = () => useContext(LabelCatalogContext);

const FALLBACK_COLOR = "#64748b";

// Color of a label by name (case-insensitive); gray when it is not registered.
export function useLabelColor() {
  const { labels } = useLabelCatalog();
  const byName = useMemo(
    () => new Map(labels.map((label) => [label.name.toLowerCase(), label.color])),
    [labels],
  );

  return (name: string) => byName.get(name.toLowerCase()) ?? FALLBACK_COLOR;
}

// A label as a colored pill. `size="sm"` is the Kanban card flavor.
export function LabelChip({
  name,
  color,
  size = "md",
  className,
  children,
}: {
  name: string;
  // explicit color (admin screen); otherwise looked up in the catalog
  color?: string;
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
}) {
  const colorOf = useLabelColor();
  const background = color ?? colorOf(name);

  return (
    <span
      title={name}
      style={{ backgroundColor: background, color: readableTextColor(background) }}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 font-medium",
        size === "sm"
          ? "rounded px-1.5 py-0.5 text-[11px]"
          : "rounded-full px-2.5 py-0.5 text-xs",
        className,
      )}
    >
      <span className="min-w-0 truncate">{name}</span>
      {children}
    </span>
  );
}
