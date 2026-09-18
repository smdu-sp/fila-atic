import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

// Previous / next links that keep the current filters. `params` are the
// active query params without `page`.
export function Pagination({
  basePath,
  params,
  page,
  pageCount,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
}) {
  const href = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) next.set(key, value);
    }
    if (target > 1) next.set("page", String(target));
    return next.toString() ? `${basePath}?${next}` : basePath;
  };

  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <span>
        {total === 0
          ? "Nenhum resultado"
          : `Mostrando ${first}–${last} de ${total}`}
      </span>
      {pageCount > 1 ? (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={href(page - 1)} rel="prev">
                <ChevronLeft />
                Anterior
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <ChevronLeft />
              Anterior
            </Button>
          )}
          <span className="px-1 tabular-nums">
            Página {page} de {pageCount}
          </span>
          {page < pageCount ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={href(page + 1)} rel="next">
                Próxima
                <ChevronRight />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              Próxima
              <ChevronRight />
            </Button>
          )}
        </div>
      ) : null}
    </nav>
  );
}
