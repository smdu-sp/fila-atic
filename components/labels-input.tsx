"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, X } from "lucide-react";

import { LabelChip, useLabelCatalog } from "@/components/label-catalog";
import { Input } from "@/components/ui/input";
import { MAX_LABELS } from "@/lib/taskFields";

// Picks task labels from the managed palette: the chosen ones as removable
// chips and, below, the palette to toggle from (with a filter once it grows).
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
  const { labels: palette, canManage } = useLabelCatalog();
  const [filter, setFilter] = useState("");
  const full = value.length >= MAX_LABELS;
  const chosen = new Set(value.map((name) => name.toLowerCase()));

  const toggle = (name: string) =>
    onChange(
      chosen.has(name.toLowerCase())
        ? value.filter((item) => item.toLowerCase() !== name.toLowerCase())
        : [...value, name],
    );

  const query = filter.trim().toLowerCase();
  const options = query
    ? palette.filter((label) => label.name.toLowerCase().includes(query))
    : palette;

  return (
    <div className="grid min-w-0 gap-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((name) => (
            <li key={name} className="flex max-w-full">
              <LabelChip name={name} className="py-0.5 pl-2.5 pr-1">
                {disabled ? null : (
                  <button
                    type="button"
                    aria-label={`Remover etiqueta ${name}`}
                    onClick={() => toggle(name)}
                    className="rounded-full p-0.5 opacity-70 hover:bg-black/15 hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </LabelChip>
            </li>
          ))}
        </ul>
      ) : null}
      {disabled ? (
        value.length ? null : (
          <span className="text-sm text-muted-foreground">Sem etiquetas</span>
        )
      ) : palette.length ? (
        <div className="grid min-w-0 gap-1.5">
          {palette.length > 6 ? (
            <Input
              id={id}
              value={filter}
              placeholder="Filtrar etiquetas"
              aria-label="Filtrar etiquetas"
              onChange={(event) => setFilter(event.target.value)}
            />
          ) : null}
          <ul
            id={palette.length > 6 ? undefined : id}
            className="grid max-h-44 min-w-0 gap-0.5 overflow-y-auto rounded-md border p-1"
          >
            {options.length ? (
              options.map((label) => {
                const selected = chosen.has(label.name.toLowerCase());
                return (
                  <li key={label.name} className="min-w-0">
                    <button
                      type="button"
                      aria-pressed={selected}
                      disabled={!selected && full}
                      onClick={() => toggle(label.name)}
                      className="flex w-full min-w-0 items-center gap-2 rounded px-1.5 py-1 text-start text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <span
                        aria-hidden
                        className="size-3 shrink-0 rounded-full"
                        style={{ backgroundColor: label.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                      {selected ? <CheckIcon className="size-4 shrink-0" /> : null}
                    </button>
                  </li>
                );
              })
            ) : (
              <li className="px-1.5 py-1 text-sm text-muted-foreground">
                Nenhuma etiqueta encontrada
              </li>
            )}
          </ul>
          {full ? (
            <span className="text-xs text-muted-foreground">
              Máximo de {MAX_LABELS} etiquetas por tarefa.
            </span>
          ) : null}
        </div>
      ) : (
        <p id={id} className="text-sm text-muted-foreground">
          Nenhuma etiqueta cadastrada.{" "}
          {canManage ? (
            <Link
              href="/administracao/etiquetas"
              className="underline underline-offset-2"
            >
              Cadastrar etiquetas
            </Link>
          ) : (
            "A coordenação cadastra as etiquetas em Administração."
          )}
        </p>
      )}
    </div>
  );
}
