"use client";

import { CheckIcon } from "lucide-react";

import { LABEL_COLOR_PRESETS, readableTextColor } from "@/lib/labelColors";
import { cn } from "@/lib/utils";

// Preset swatches plus a native color input for any other "#rrggbb".
export function LabelColorPicker({
  value,
  onChange,
  label = "Cor",
}: {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}) {
  const isPreset = LABEL_COLOR_PRESETS.some((color) => color === value);

  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5"
    >
      {LABEL_COLOR_PRESETS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Cor ${color}`}
          aria-pressed={value === color}
          onClick={() => onChange(color)}
          style={{ backgroundColor: color, color: readableTextColor(color) }}
          className={cn(
            "flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition hover:scale-110",
            value === color && "ring-2 ring-ring",
          )}
        >
          {value === color ? <CheckIcon className="size-3.5" /> : null}
        </button>
      ))}
      <label
        title="Outra cor"
        className={cn(
          "relative flex size-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed text-[10px] font-semibold text-muted-foreground ring-offset-2 ring-offset-background",
          !isPreset && "ring-2 ring-ring",
        )}
        style={
          !isPreset
            ? { backgroundColor: value, borderStyle: "solid" }
            : undefined
        }
      >
        {isPreset ? "+" : null}
        <input
          type="color"
          aria-label="Escolher outra cor"
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
