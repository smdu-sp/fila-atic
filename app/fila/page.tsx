import { ProjectCategory, ProjectPriority } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { COORDINATION_ROLES } from "@/lib/roles";
import {
  queueStats,
  searchQueue,
  type QueueSearch,
} from "@/actions/queueActions";
import { AppSidebar } from "@/components/app-sidebar";
import { DueBadge } from "@/components/due-badge";
import { ListFilters, type FilterField } from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import { ProjectUpdateForm } from "@/components/project-update-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { requireRole } from "@/lib/auth";
import { toDateInput } from "@/lib/dueDate";
import { firstParam, oneOf, parsePage } from "@/lib/listParams";
import {
  categoryLabels,
  getCategoryLabel,
  getPriorityLabel,
  getStatusBadgeClass,
  getStatusLabel,
  priorityLabels,
} from "@/lib/projectLabels";
import Link from "next/link";

const priorityVariant: Record<
  ProjectPriority,
  "default" | "secondary" | "destructive"
> = {
  LOW: "default",
  MEDIUM: "secondary",
  HIGH: "destructive",
  URGENT: "destructive",
};

const SORTS = ["newest", "priority"] as const;

const filterFields: FilterField[] = [
  {
    type: "search",
    name: "q",
    placeholder: "Buscar por título, solicitante ou setor",
  },
  {
    type: "select",
    name: "prioridade",
    label: "Prioridade",
    options: Object.values(ProjectPriority).map((value) => ({
      value,
      label: priorityLabels[value],
    })),
  },
  {
    type: "select",
    name: "categoria",
    label: "Categoria",
    options: Object.values(ProjectCategory).map((value) => ({
      value,
      label: categoryLabels[value],
    })),
  },
  {
    type: "select",
    name: "ordem",
    label: "Ordem",
    allLabel: "Mais antigos primeiro",
    options: [
      { value: "newest", label: "Mais recentes primeiro" },
      { value: "priority", label: "Maior prioridade primeiro" },
    ],
  },
];

export default async function FilaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(COORDINATION_ROLES);

  const raw = await searchParams;
  const filters = {
    q: firstParam(raw.q),
    prioridade: oneOf(raw.prioridade, Object.values(ProjectPriority)),
    categoria: oneOf(raw.categoria, Object.values(ProjectCategory)),
    ordem: oneOf(raw.ordem, SORTS),
  };
  const search: QueueSearch = {
    q: filters.q,
    priority: filters.prioridade,
    category: filters.categoria,
    sort: filters.ordem,
    page: parsePage(raw.page),
  };

  const [result, statsResult] = await Promise.all([
    searchQueue(search),
    queueStats(),
  ]);
  const page = result.success ? result.data : null;
  const stats = statsResult.success
    ? statsResult.data
    : { total: 0, high: 0, urgent: 0 };

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Fila de demandas" />
          <div className="grid w-full min-w-0 gap-6 bg-muted/50 p-4 pt-6 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Fila de demandas</h1>
              <p className="text-sm text-muted-foreground">
                Priorize e acompanhe as novas solicitações recebidas.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {[
                { label: "Total na fila", value: stats.total },
                { label: "Prioridade alta", value: stats.high },
                { label: "Urgentes", value: stats.urgent },
              ].map((item) => (
                <Card key={item.label}>
                  <CardHeader className="pb-2">
                    <CardDescription>{item.label}</CardDescription>
                    <CardTitle className="text-3xl">{item.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <ListFilters fields={filterFields} />

            <Card>
              <CardHeader>
                <CardTitle>Demandas aguardando avaliação</CardTitle>
                <CardDescription>
                  Confirme escopo, prioridade, previsão e designação inicial.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {!result.success ? (
                  <div className="text-sm text-destructive">{result.error}</div>
                ) : null}
                {page && page.items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {stats.total === 0
                      ? "A fila está vazia."
                      : "Nenhuma demanda encontrada com esses filtros."}
                  </p>
                ) : null}
                {page?.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="grid gap-1.5">
                      <Link
                        href={`/solicitacoes/${item.id}`}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.requesterName} · {item.requesterDepartment} ·
                        recebida em {item.createdAt.toLocaleDateString("pt-BR")}
                      </p>
                      <DueBadge dueDate={item.dueDate} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={priorityVariant[item.priority]}>
                        {getPriorityLabel(item.priority)}
                      </Badge>
                      {item.category ? (
                        <Badge variant="outline">
                          {getCategoryLabel(item.category)}
                        </Badge>
                      ) : null}
                      <Badge
                        variant="outline"
                        className={getStatusBadgeClass(item.status)}
                      >
                        {getStatusLabel(item.status)}
                      </Badge>
                      <ProjectUpdateForm
                        projectId={item.id}
                        defaultStatus={item.status}
                        defaultPriority={item.priority}
                        showDueDate
                        defaultDueDate={toDateInput(item.dueDate)}
                        showCategory
                        defaultCategory={item.category}
                        compact
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {page ? (
              <Pagination
                basePath="/fila"
                params={filters}
                page={page.page}
                pageCount={page.pageCount}
                pageSize={page.pageSize}
                total={page.total}
              />
            ) : null}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
