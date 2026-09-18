"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FilterField =
  | { type: "search"; name: string; placeholder: string }
  | {
      type: "select";
      name: string;
      label: string;
      options: Array<{ value: string; label: string }>;
      // Text of the "no filter" entry (default: "Todos").
      allLabel?: string;
    }
  | { type: "toggle"; name: string; label: string }
  | { type: "date"; name: string; label: string };

const ALL = "__all__";

// The URL is the source of truth: every change rewrites the query string
// (and drops ?page), so filtered lists can be bookmarked and shared, and the
// server component re-renders with the new results.
export function ListFilters({ fields }: { fields: FilterField[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const searchField = fields.find((field) => field.type === "search");
  const urlSearch = searchField ? (params.get(searchField.name) ?? "") : "";
  const [text, setText] = useState(urlSearch);
  // what this component itself last put in the URL, and the URL it last saw
  const [sent, setSent] = useState(urlSearch);
  const [seenUrl, setSeenUrl] = useState(urlSearch);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The URL changed by something else (back/forward, "clear filters"): show it
  // in the box. Our own debounced updates are skipped, so a trailing space the
  // person just typed is not trimmed away while they keep typing.
  if (urlSearch !== seenUrl) {
    setSeenUrl(urlSearch);
    if (urlSearch !== sent) {
      setText(urlSearch);
      setSent(urlSearch);
    }
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const navigate = (changes: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");

    const url = next.toString() ? `${pathname}?${next}` : pathname;
    startTransition(() => (replace ? router.replace(url) : router.push(url)));
  };

  const onSearch = (value: string) => {
    setText(value);
    if (!searchField) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSent(value.trim());
      navigate({ [searchField.name]: value.trim() || null }, true);
    }, 350);
  };

  const hasFilters = fields.some((field) => params.get(field.name));

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        isPending && "opacity-70",
      )}
      role="search"
    >
      {fields.map((field) => {
        if (field.type === "search") {
          return (
            <div key={field.name} className="relative w-full sm:w-72">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={text}
                onChange={(event) => onSearch(event.target.value)}
                placeholder={field.placeholder}
                aria-label={field.placeholder}
                className="bg-background pl-8"
              />
            </div>
          );
        }

        if (field.type === "select") {
          return (
            <Select
              key={field.name}
              value={params.get(field.name) ?? ALL}
              onValueChange={(value) =>
                navigate({ [field.name]: value === ALL ? null : value })
              }
            >
              <SelectTrigger
                className="w-auto min-w-36 bg-background"
                aria-label={field.label}
              >
                <SelectValue placeholder={field.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>
                  {field.allLabel ?? `${field.label}: todos`}
                </SelectItem>
                {field.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }

        if (field.type === "toggle") {
          const active = params.get(field.name) === "1";
          return (
            <Button
              key={field.name}
              type="button"
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() => navigate({ [field.name]: active ? null : "1" })}
            >
              {field.label}
            </Button>
          );
        }

        return (
          <label
            key={field.name}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            {field.label}
            <Input
              type="date"
              value={params.get(field.name) ?? ""}
              onChange={(event) =>
                navigate({ [field.name]: event.target.value || null })
              }
              className="w-auto bg-background"
            />
          </label>
        );
      })}

      {hasFilters ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            navigate(Object.fromEntries(fields.map((f) => [f.name, null])))
          }
        >
          <X />
          Limpar filtros
        </Button>
      ) : null}
    </div>
  );
}
