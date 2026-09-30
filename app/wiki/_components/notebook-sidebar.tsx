"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FileTextIcon, SearchIcon, XIcon } from "lucide-react";

import {
  searchNotebookPages,
  type NotebookTreeNode,
} from "@/actions/notebookActions";
import { NotebookTree } from "@/app/wiki/_components/notebook-tree";
import { Input } from "@/components/ui/input";
import type { NotebookSearchResult } from "@/lib/wikiSearch";

const DEBOUNCE_MS = 300;

// The sidebar's search box, kept apart from NotebookTree: while a query is
// typed, results (title and body matches, across the whole wiki) replace the
// tree; clearing the box brings the tree back.
export function NotebookSidebar({
  nodes,
  currentPageId,
  onAddChild,
}: {
  nodes: NotebookTreeNode[];
  currentPageId: string | null;
  onAddChild: (parentId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NotebookSearchResult[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // a request that is still running when a newer one starts must not be
  // allowed to overwrite it once it (eventually) resolves
  const requestId = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const runSearch = (text: string) => {
    const id = ++requestId.current;
    startTransition(async () => {
      const result = await searchNotebookPages(text);
      if (id !== requestId.current) return;
      setResults(result.success ? result.data : []);
    });
  };

  const onChange = (value: string) => {
    setQuery(value);
    clearTimeout(timer.current);

    const trimmed = value.trim();
    if (!trimmed) {
      requestId.current++;
      setResults(null);
      return;
    }
    timer.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
  };

  const searching = query.trim().length > 0;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <div className="relative min-w-0">
        <SearchIcon
          aria-hidden
          className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Buscar na wiki"
          aria-label="Buscar na wiki"
          className="h-8 min-w-0 ps-8 pe-7 text-sm"
        />
        {query ? (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => onChange("")}
            className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>

      {searching ? (
        <SearchResults results={results} loading={isPending} query={query.trim()} />
      ) : (
        <NotebookTree nodes={nodes} currentPageId={currentPageId} onAddChild={onAddChild} />
      )}
    </div>
  );
}

function SearchResults({
  results,
  loading,
  query,
}: {
  results: NotebookSearchResult[] | null;
  loading: boolean;
  query: string;
}) {
  if (results === null && loading) {
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">Buscando…</p>;
  }

  if (!results || results.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-sm text-muted-foreground">
        Nenhuma página encontrada para &quot;{query}&quot;.
      </p>
    );
  }

  return (
    <ul className="grid min-w-0 gap-0.5" aria-label="Resultados da busca">
      {results.map((result) => (
        <li key={result.id} className="min-w-0">
          <Link
            href={`/wiki?p=${result.id}`}
            className="grid min-w-0 gap-0.5 rounded-md px-2 py-1.5 hover:bg-accent"
          >
            {result.breadcrumbs.length > 1 ? (
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {result.breadcrumbs
                  .slice(0, -1)
                  .map((crumb) => crumb.title)
                  .join(" / ")}
              </span>
            ) : null}
            <span className="flex min-w-0 items-center gap-1.5">
              <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate text-sm font-medium">{result.title}</span>
            </span>
            {result.snippet ? (
              <span className="min-w-0 truncate text-xs text-muted-foreground">{result.snippet}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
