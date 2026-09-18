"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  MAX_LABEL_LENGTH,
  MAX_LABELS,
  normalizeLabels,
} from "@/lib/taskFields";

// Labels as removable chips. Enter, comma or leaving the field adds what was
// typed; Backspace on an empty field removes the last one.
export function LabelsInput({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id?: string;
  value: string[];
  onChange: (labels: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const full = value.length >= MAX_LABELS;

  const commit = (text: string) => {
    const result = normalizeLabels([...value, ...text.split(",")]);
    setDraft("");
    if (result.ok) onChange(result.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      if (draft.trim()) commit(draft);
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="grid gap-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((label) => (
            <li
              key={label}
              className="flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 text-xs font-medium text-secondary-foreground"
            >
              {label}
              {disabled ? null : (
                <button
                  type="button"
                  aria-label={`Remover etiqueta ${label}`}
                  onClick={() =>
                    onChange(value.filter((item) => item !== label))
                  }
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {disabled ? (
        value.length ? null : (
          <span className="text-sm text-muted-foreground">Sem etiquetas</span>
        )
      ) : (
        <Input
          id={id}
          value={draft}
          maxLength={MAX_LABEL_LENGTH}
          disabled={full}
          placeholder={
            full ? `Máximo de ${MAX_LABELS} etiquetas` : "Digite e tecle Enter"
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
        />
      )}
    </div>
  );
}
