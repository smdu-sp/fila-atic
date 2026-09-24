import {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
  TaskStatus,
} from "@prisma/client";

import { getGeneralReport, type GeneralReport } from "@/actions/reportActions";
import { listTaskStatusLabels } from "@/actions/taskStatusActions";
import { AppSidebar } from "@/components/app-sidebar";
import {
  BarsChart,
  DonutChart,
  StackedBarsChart,
  TimelineChart,
} from "@/components/charts";
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
import {
  CATEGORY_COLORS,
  PRIORITY_COLORS,
  PROJECT_STATUS_COLORS,
  SERIES_COLORS,
  TASK_STATUS_COLORS,
} from "@/lib/chartColors";
import { firstParam } from "@/lib/listParams";
import {
  categoryLabels,
  priorityLabels,
  statusLabels,
  taskStatusLabels,
} from "@/lib/projectLabels";
import { COORDINATION_ROLES } from "@/lib/roles";

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
  const [result, taskLabelsResult] = await Promise.all([
    getGeneralReport({ from: filters.de, to: filters.ate }),
    listTaskStatusLabels(),
  ]);
  const taskLabels = taskLabelsResult.success
    ? taskLabelsResult.data
    : taskStatusLabels;

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Relatórios" />
          <div className="grid w-full min-w-0 gap-6 p-4 pt-6 sm:p-6 sm:pt-4">
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
              <ReportBody data={result.data} taskLabels={taskLabels} />
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function ReportBody({
  data,
  taskLabels,
}: {
  data: GeneralReport;
  taskLabels: Record<TaskStatus, string>;
}) {
  const {
    totalProjects,
    byStatus,
    byPriority,
    byCategory,
    avgDaysInStatus,
    timeline,
    tasksByStatus,
    tasksCompletedInPeriod,
    tasksOpenNow,
    tasksOverdueNow,
    developers,
  } = data;

  const statusSlices = Object.values(ProjectStatus).map((status) => ({
    key: status,
    label: statusLabels[status],
    value: byStatus[status],
    color: PROJECT_STATUS_COLORS[status],
  }));
  const prioritySlices = Object.values(ProjectPriority).map((priority) => ({
    key: priority,
    label: priorityLabels[priority],
    value: byPriority[priority],
    color: PRIORITY_COLORS[priority],
  }));
  const categoryItems = [
    ...Object.values(ProjectCategory).map((category) => ({
      key: category,
      label: categoryLabels[category],
      value: byCategory[category],
      color: CATEGORY_COLORS[category],
    })),
    {
      key: "NONE",
      label: "Sem categoria",
      value: byCategory.NONE,
      color: CATEGORY_COLORS.NONE,
    },
  ];
  const taskSlices = Object.values(TaskStatus).map((status) => ({
    key: status,
    label: taskLabels[status],
    value: tasksByStatus[status],
    color: TASK_STATUS_COLORS[status],
  }));
  const stageItems = stageOrder.map((status) => ({
    key: status,
    label: statusLabels[status],
    value: avgDaysInStatus[status] ?? 0,
    color: PROJECT_STATUS_COLORS[status],
  }));

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <Card>
        <CardHeader>
          <CardTitle>Solicitações ao longo do tempo</CardTitle>
          <CardDescription>
            Abertas e finalizadas por{" "}
            {timeline.granularity === "week" ? "semana" : "mês"} dentro do
            período.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineChart
            points={timeline.buckets.map((bucket) => ({
              label: bucket.label,
              created: bucket.created,
              finished: bucket.finished,
            }))}
            series={[
              {
                key: "created",
                label: "Abertas",
                color: SERIES_COLORS.primary,
              },
              {
                key: "finished",
                label: "Finalizadas",
                color: SERIES_COLORS.positive,
              },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por status</CardTitle>
            <CardDescription>
              Situação atual das solicitações abertas no período.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart slices={statusSlices} totalLabel="solicitações" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tarefas por status</CardTitle>
            <CardDescription>
              Todas as tarefas do quadro agora (o período não se aplica).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              slices={taskSlices}
              totalLabel="tarefas"
              emptyMessage="Nenhuma tarefa ainda."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por prioridade</CardTitle>
            <CardDescription>Solicitações abertas no período.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarsChart items={prioritySlices} labelWidth={80} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por categoria</CardTitle>
            <CardDescription>Solicitações abertas no período.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarsChart items={categoryItems} labelWidth={130} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tempo médio por etapa</CardTitle>
          <CardDescription>
            Em dias. Só entram etapas já concluídas dentro do período (a etapa
            atual de um projeto ainda em andamento não conta). Histórico
            anterior a 18/09/2026 é aproximado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BarsChart
            items={stageItems}
            labelWidth={130}
            valueName="Dias"
            emptyMessage="Nenhuma etapa concluída no período."
          />
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
        <CardContent className="grid gap-4">
          {developers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum desenvolvedor ativo cadastrado.
            </p>
          ) : (
            <>
              <StackedBarsChart
                rows={developers.map((dev) => ({
                  label: dev.name,
                  completed: dev.completedInPeriod,
                  onTime: dev.openNow - dev.overdueNow,
                  overdue: dev.overdueNow,
                }))}
                series={[
                  {
                    key: "completed",
                    label: "Concluídas no período",
                    color: SERIES_COLORS.positive,
                  },
                  {
                    key: "onTime",
                    label: "Em aberto (no prazo)",
                    color: SERIES_COLORS.primary,
                  },
                  {
                    key: "overdue",
                    label: "Atrasadas",
                    color: SERIES_COLORS.danger,
                  },
                ]}
                emptyMessage="Nenhuma tarefa concluída ou em aberto."
              />
              <div className="grid gap-2">
                <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_7rem] gap-2 px-3 text-xs font-medium text-muted-foreground sm:grid">
                  <span>Desenvolvedor</span>
                  <span className="text-right">Concluídas</span>
                  <span className="text-right">Em aberto</span>
                  <span className="text-right">Atrasadas</span>
                </div>
                {developers.map((dev) => (
                  <div
                    key={dev.id}
                    className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_7rem_7rem_7rem]"
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
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
