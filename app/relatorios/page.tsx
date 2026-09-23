import {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
} from "@prisma/client";

import { getGeneralReport, type GeneralReport } from "@/actions/reportActions";
import { AppSidebar } from "@/components/app-sidebar";
import { ListFilters, type FilterField } from "@/components/list-filters";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRole } from "@/lib/auth";
import { firstParam } from "@/lib/listParams";
import {
  categoryLabels,
  priorityLabels,
  statusLabels,
} from "@/lib/projectLabels";
import { COORDINATION_ROLES } from "@/lib/roles";
import { StatBars } from "@/app/relatorios/_components/stat-bars";

const filterFields: FilterField[] = [
  { type: "date", name: "de", label: "De" },
  { type: "date", name: "ate", label: "Até" },
];

// Stages whose average time is worth showing; IN_QUEUE (before triage) is
// included because a slow queue is itself worth flagging.
const stageOrder: ProjectStatus[] = [
  ProjectStatus.IN_QUEUE,
  ProjectStatus.IN_ANALYSIS,
  ProjectStatus.IN_DEVELOPMENT,
  ProjectStatus.IN_TESTING,
];

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole(COORDINATION_ROLES);

  const raw = await searchParams;
  const filters = { de: firstParam(raw.de), ate: firstParam(raw.ate) };
  const result = await getGeneralReport({ from: filters.de, to: filters.ate });

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Relatórios" />
          <div className="grid w-full min-w-0 gap-6 bg-muted/50 p-4 pt-6 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Relatórios</h1>
              <p className="text-sm text-muted-foreground">
                Indicadores gerais e desempenho da equipe. Sem período
                selecionado, os totais de solicitações e o tempo por etapa
                consideram tudo desde o início.
              </p>
            </div>

            <ListFilters fields={filterFields} />

            {!result.success ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <ReportBody data={result.data} />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function ReportBody({ data }: { data: GeneralReport }) {
  const {
    totalProjects,
    byStatus,
    byPriority,
    byCategory,
    avgDaysInStatus,
    tasksCompletedInPeriod,
    tasksOpenNow,
    tasksOverdueNow,
    developers,
  } = data;

  const statusItems = Object.values(ProjectStatus).map((status) => ({
    label: statusLabels[status],
    value: byStatus[status],
  }));
  const priorityItems = Object.values(ProjectPriority).map((priority) => ({
    label: priorityLabels[priority],
    value: byPriority[priority],
  }));
  const categoryItems = [
    ...Object.values(ProjectCategory).map((category) => ({
      label: categoryLabels[category],
      value: byCategory[category],
    })),
    { label: "Sem categoria", value: byCategory.NONE },
  ];

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Solicitações no período", value: totalProjects },
          {
            label: "Tarefas concluídas no período",
            value: tasksCompletedInPeriod,
          },
          { label: "Tarefas em aberto agora", value: tasksOpenNow },
          { label: "Tarefas atrasadas agora", value: tasksOverdueNow },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardDescription>{item.label}</CardDescription>
              <CardTitle className="text-3xl">{item.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Por status</CardTitle>
            <CardDescription>Solicitações abertas no período.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatBars items={statusItems} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por prioridade</CardTitle>
            <CardDescription>Solicitações abertas no período.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatBars items={priorityItems} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por categoria</CardTitle>
            <CardDescription>Solicitações abertas no período.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatBars items={categoryItems} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tempo médio por etapa</CardTitle>
          <CardDescription>
            Só entram etapas já concluídas dentro do período (a etapa atual de
            um projeto ainda em andamento não conta). Histórico anterior a
            18/09/2026 é aproximado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stageOrder.every((status) => !avgDaysInStatus[status]) ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma etapa concluída no período.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {stageOrder.map((status) => (
                <li
                  key={status}
                  className="rounded-lg border border-border/60 px-3 py-2"
                >
                  <p className="text-xs text-muted-foreground">
                    {statusLabels[status]}
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {avgDaysInStatus[status] !== undefined
                      ? `${avgDaysInStatus[status]} dia(s)`
                      : "—"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Desempenho por desenvolvedor</CardTitle>
          <CardDescription>
            Concluídas considera o período selecionado; em aberto e atrasadas
            são a situação agora, independente do período.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {developers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum desenvolvedor ativo cadastrado.
            </p>
          ) : (
            <>
              <div className="hidden grid-cols-[1fr_7rem_7rem_7rem] gap-2 px-3 text-xs font-medium text-muted-foreground sm:grid">
                <span>Desenvolvedor</span>
                <span className="text-right">Concluídas</span>
                <span className="text-right">Em aberto</span>
                <span className="text-right">Atrasadas</span>
              </div>
              {developers.map((dev) => (
                <div
                  key={dev.id}
                  className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm sm:grid-cols-[1fr_7rem_7rem_7rem]"
                >
                  <span className="col-span-2 truncate font-medium sm:col-span-1 sm:font-normal">
                    {dev.name}
                  </span>
                  <span className="text-muted-foreground sm:text-right sm:text-foreground">
                    Concluídas:{" "}
                    <span className="tabular-nums">
                      {dev.completedInPeriod}
                    </span>
                  </span>
                  <span className="text-muted-foreground sm:text-right sm:text-foreground">
                    Em aberto:{" "}
                    <span className="tabular-nums">{dev.openNow}</span>
                  </span>
                  <span
                    className={
                      dev.overdueNow > 0
                        ? "text-destructive sm:text-right"
                        : "text-muted-foreground sm:text-right sm:text-foreground"
                    }
                  >
                    Atrasadas:{" "}
                    <span className="tabular-nums">{dev.overdueNow}</span>
                  </span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
