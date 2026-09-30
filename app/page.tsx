import { ProjectPriority, ProjectStatus, Role, TaskStatus } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { isCoordination } from "@/lib/roles";
import {
  getDashboardMetrics,
  listDashboardCharts,
} from "@/actions/dashboardActions";
import { listTaskStatusLabels } from "@/actions/taskStatusActions";
import { listProjectLogs } from "@/actions/logActions";
import { listProjects } from "@/actions/projectActions";
import { listProjectRequestFields } from "@/actions/requestFormActions";
import { AppSidebar } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DueBadge } from "@/components/due-badge";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { dueState } from "@/lib/dueDate";
import {
  BarsChart,
  DonutChart,
  StackedBarsChart,
  TimelineChart,
} from "@/components/charts";
import {
  PRIORITY_COLORS,
  PROJECT_STATUS_COLORS,
  SERIES_COLORS,
  TASK_STATUS_COLORS,
} from "@/lib/chartColors";
import { CreateProjectForm } from "@/app/projetos/_components/create-project-form";
import {
  getStatusBadgeClass,
  getStatusLabel,
  priorityLabels,
  statusLabels,
  taskStatusLabels,
} from "@/lib/projectLabels";

export default async function Page() {
  const [
    projectsResult,
    logsResult,
    chartsResult,
    fieldsResult,
    metricsResult,
    taskLabelsResult,
    session,
  ] = await Promise.all([
    listProjects(),
    listProjectLogs(),
    listDashboardCharts(),
    listProjectRequestFields(),
    getDashboardMetrics(),
    listTaskStatusLabels(),
    getServerAuthSession(),
  ]);
  const metrics = metricsResult.success ? metricsResult.data : null;
  const taskLabels = taskLabelsResult.success
    ? taskLabelsResult.data
    : taskStatusLabels;
  const projects = projectsResult.success ? projectsResult.data : [];
  const logs = logsResult.success ? logsResult.data : [];
  const charts = chartsResult.success ? chartsResult.data : null;
  const requestFields = fieldsResult.success ? fieldsResult.data : [];
  const isCoordinator = isCoordination(session?.user?.role);
  const isRequester = session?.user?.role === Role.REQUESTER;
  const totalQueue = projects.filter(
    (project) => project.status === ProjectStatus.IN_QUEUE,
  ).length;
  const totalAnalysis = projects.filter(
    (project) => project.status === ProjectStatus.IN_ANALYSIS,
  ).length;
  const totalDevelopment = projects.filter(
    (project) => project.status === ProjectStatus.IN_DEVELOPMENT,
  ).length;
  const totalFinished = projects.filter(
    (project) => project.status === ProjectStatus.FINISHED,
  ).length;

  const totalOverdue = projects.filter(
    (project) =>
      dueState(project.dueDate, {
        closed:
          project.status === ProjectStatus.FINISHED ||
          project.status === ProjectStatus.CANCELED,
      }).kind === "overdue",
  ).length;

  const stats = [
    {
      title: "Na fila",
      value: String(totalQueue),
      description: "Pedidos aguardando triagem",
    },
    {
      title: "Em analise",
      value: String(totalAnalysis),
      description: "Demandas em validacao",
    },
    {
      title: "Em desenvolvimento",
      value: String(totalDevelopment),
      description: "Projetos ativos",
    },
    {
      title: "Finalizados",
      value: String(totalFinished),
      description: "Entregas concluidas",
    },
    {
      title: "Atrasados",
      value: String(totalOverdue),
      description: "Passaram da previsão de entrega",
    },
  ];

  const projectStatusSlices = Object.values(ProjectStatus).map((status) => ({
    key: status,
    label: statusLabels[status],
    value: projects.filter((project) => project.status === status).length,
    color: PROJECT_STATUS_COLORS[status],
  }));
  const prioritySlices = Object.values(ProjectPriority).map((priority) => ({
    key: priority,
    label: priorityLabels[priority],
    value: projects.filter((project) => project.priority === priority).length,
    color: PRIORITY_COLORS[priority],
  }));
  const taskStatusSlices = metrics
    ? Object.values(TaskStatus).map((status) => ({
        key: status,
        label: taskLabels[status],
        value: metrics.tasksByStatus[status],
        color: TASK_STATUS_COLORS[status],
      }))
    : [];

  const recent = logs.slice(0, 5);
  const requesterOpenProjects = projects.filter(
    (project) =>
      project.status !== ProjectStatus.FINISHED &&
      project.status !== ProjectStatus.CANCELED,
  );
  const currentUserName = session?.user?.name ?? session?.user?.email ?? "";
  const translateLogMessage = (message: string) => {
    let result = message;
    Object.entries(statusLabels).forEach(([key, label]) => {
      result = result.replaceAll(key, label);
    });
    Object.entries(taskStatusLabels).forEach(([key, label]) => {
      result = result.replaceAll(key, label);
    });
    Object.entries(priorityLabels).forEach(([key, label]) => {
      result = result.replaceAll(key, label);
    });
    return result;
  };
  const getMessageContent = (message: string) =>
    message.trim() ? message.trim() : "anexos";
  const getMessageLabel = (authorName: string) =>
    currentUserName && authorName === currentUserName
      ? "Mensagem enviada"
      : "Mensagem recebida";
  const getActivitySummary = (item: {
    message: string;
    authorName: string;
    isInternal: boolean;
  }) =>
    item.isInternal
      ? `Atualizacao interna - ${translateLogMessage(item.message)}`
      : `${getMessageLabel(item.authorName)} [${getMessageContent(item.message)}]`;

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0 min-h-svh">
          <PageHeader title="Dashboard" />
          <div className="w-full min-w-0 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold">Visao geral</h1>
              {isRequester ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Abrir nova solicitação</Button>
                  </DialogTrigger>
                  <DialogContent size="lg">
                    <DialogHeader>
                      <DialogTitle>Nova solicitação</DialogTitle>
                      <DialogDescription>
                        Descreva o que você precisa. A coordenação faz a
                        triagem e define a prioridade.
                      </DialogDescription>
                    </DialogHeader>
                    <CreateProjectForm fields={requestFields} />
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>

            {isRequester ? (
              <div className="gap-4 mt-6 grid lg:grid-cols-3">
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Suas solicitações abertas</CardTitle>
                    <CardDescription>
                      Acompanhe o status das suas solicitações.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!projectsResult.success ? (
                      <div className="text-sm text-destructive">
                        {projectsResult.error}
                      </div>
                    ) : null}
                    {requesterOpenProjects.length ? (
                      requesterOpenProjects.map((project) => (
                        <div
                          key={project.id}
                          className="flex flex-col gap-2 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <Link
                              href={`/solicitacoes/${project.id}`}
                              className="text-sm font-semibold text-foreground hover:underline"
                            >
                              {project.title}
                            </Link>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="outline"
                              className={getStatusBadgeClass(project.status)}
                            >
                              {getStatusLabel(project.status)}
                            </Badge>
                            <DueBadge dueDate={project.dueDate} />
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nenhum projeto aberto no momento.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-1">
                  <CardHeader>
                    <CardTitle>Atividades recentes</CardTitle>
                    <CardDescription>
                      Ultimas atualizacoes dos seus projetos.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!logsResult.success ? (
                      <div className="text-sm text-destructive">
                        {logsResult.error}
                      </div>
                    ) : null}
                    {recent.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1 rounded-md border border-border/60 px-3 py-2"
                      >
                        <p className="text-sm font-semibold">
                          {item.projectTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {getActivitySummary(item)}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <>
                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  {stats.map((item) => (
                    <Card key={item.title}>
                      <CardHeader className="pb-2">
                        <CardDescription>{item.title}</CardDescription>
                        <CardTitle className="text-3xl">{item.value}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-xs text-muted-foreground">
                        {item.description}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Projetos por status</CardTitle>
                      <CardDescription>
                        Onde está cada projeto agora.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DonutChart
                        slices={projectStatusSlices}
                        totalLabel="projetos"
                        emptyMessage="Nenhum projeto cadastrado."
                      />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        {metrics?.scope === "mine"
                          ? "Minhas tarefas por status"
                          : "Tarefas por status"}
                      </CardTitle>
                      <CardDescription>
                        {metrics?.scope === "mine"
                          ? "Tarefas atribuídas a você."
                          : "Todas as tarefas do quadro."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <DonutChart
                        slices={taskStatusSlices}
                        totalLabel="tarefas"
                        emptyMessage="Nenhuma tarefa ainda."
                      />
                    </CardContent>
                  </Card>
                </div>

                {isCoordinator && metrics ? (
                  <>
                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      <Card className="xl:col-span-2">
                        <CardHeader>
                          <CardTitle>Solicitações por semana</CardTitle>
                          <CardDescription>
                            Abertas e finalizadas nas últimas 12 semanas.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <TimelineChart
                            points={(metrics.timeline?.buckets ?? []).map(
                              (bucket) => ({
                                label: bucket.label,
                                created: bucket.created,
                                finished: bucket.finished,
                              }),
                            )}
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
                            emptyMessage="Nenhuma solicitação nas últimas 12 semanas."
                          />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>Projetos por prioridade</CardTitle>
                          <CardDescription>
                            Distribuição por nível de urgência.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <BarsChart
                            items={prioritySlices}
                            labelWidth={70}
                            emptyMessage="Nenhum projeto cadastrado."
                          />
                        </CardContent>
                      </Card>
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-3">
                      <Card className="xl:col-span-2">
                        <CardHeader>
                          <CardTitle>Carga por desenvolvedor</CardTitle>
                          <CardDescription>
                            Tarefas em aberto agora, separando as atrasadas.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <StackedBarsChart
                            rows={(metrics.workload ?? []).map((dev) => ({
                              label: dev.name,
                              onTime: dev.open - dev.overdue,
                              overdue: dev.overdue,
                            }))}
                            series={[
                              {
                                key: "onTime",
                                label: "No prazo",
                                color: SERIES_COLORS.primary,
                              },
                              {
                                key: "overdue",
                                label: "Atrasadas",
                                color: SERIES_COLORS.danger,
                              },
                            ]}
                            emptyMessage="Nenhuma tarefa em aberto."
                          />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>Solicitações abertas</CardTitle>
                          <CardDescription>
                            Principais solicitantes.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <BarsChart
                            items={(charts?.openRequestsByUser ?? []).map(
                              (item) => ({
                                key: item.label,
                                label: item.label,
                                value: item.value,
                                color: SERIES_COLORS.primary,
                              }),
                            )}
                            emptyMessage="Sem solicitações em aberto."
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : null}

                <div className="mt-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Atividades recentes</CardTitle>
                      <CardDescription>
                        Ultimas atualizacoes registradas nos projetos.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {!logsResult.success ? (
                        <div className="text-sm text-destructive">
                          {logsResult.error}
                        </div>
                      ) : null}
                      {recent.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col gap-1 rounded-md border border-border/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="text-sm font-semibold">
                              {item.projectTitle}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {getActivitySummary(item)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" asChild>
                              <Link href="/projetos">Ver detalhes</Link>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
