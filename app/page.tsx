import { ProjectStatus, Role } from "@prisma/client";

import { isCoordination } from "@/lib/roles";
import { listDashboardCharts } from "@/actions/dashboardActions";
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
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { getServerAuthSession } from "@/lib/auth";
import { dueState } from "@/lib/dueDate";
import { CreateProjectForm } from "@/app/projetos/_components/create-project-form";
import {
  getStatusBadgeClass,
  getStatusLabel,
  priorityLabels,
  statusLabels,
  taskStatusLabels,
} from "@/lib/projectLabels";

export default async function Page() {
  const [projectsResult, logsResult, chartsResult, fieldsResult, session] =
    await Promise.all([
      listProjects(),
      listProjectLogs(),
      listDashboardCharts(),
      listProjectRequestFields(),
      getServerAuthSession(),
    ]);
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

  const recent = logs.slice(0, 5);
  const maxValue = (items: Array<{ value: number }>) =>
    Math.max(1, ...items.map((item) => item.value));
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
        <SidebarInset className="min-w-0 min-h-svh bg-muted/50">
          <header className="hidden h-16 shrink-0 items-center gap-2 bg-muted/50 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 sm:flex">
            <div className="flex items-center gap-2 px-3 sm:px-4">
              <SidebarTrigger className="-ml-1 md:hidden" />
              <Separator
                orientation="vertical"
                className="mr-2 h-4 md:ml-[-16px]"
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Dashboard</span>
              </div>
            </div>
          </header>
          <div className="w-full min-w-0 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold">Visao geral</h1>
              {isRequester ? (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button>Abrir nova solicitação</Button>
                  </DialogTrigger>
                  <DialogContent>
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
                        Nenhum chamado aberto no momento.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card className="lg:col-span-1">
                  <CardHeader>
                    <CardTitle>Atividades recentes</CardTitle>
                    <CardDescription>
                      Ultimas atualizacoes dos seus chamados.
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

                {isCoordinator ? (
                  <div className="mt-6 grid gap-4 xl:grid-cols-3">
                    <Card className="bg-gradient-to-br from-muted/80 via-muted/60 to-background">
                      <CardHeader>
                        <CardTitle>Projetos por dev</CardTitle>
                        <CardDescription>
                          Distribuicao de solicitacoes.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {charts?.projectsByDeveloper.length ? (
                          charts.projectsByDeveloper.map((item) => (
                            <div key={item.label} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="truncate font-medium">
                                  {item.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {item.value}
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-foreground/10">
                                <div
                                  className="h-2 rounded-full bg-primary"
                                  style={{
                                    width: `${Math.round(
                                      (item.value /
                                        maxValue(charts.projectsByDeveloper)) *
                                        100,
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Nenhum desenvolvedor alocado ainda.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-muted/80 via-muted/60 to-background">
                      <CardHeader>
                        <CardTitle>Solicitações abertas</CardTitle>
                        <CardDescription>
                          Principais solicitantes.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {charts?.openRequestsByUser.length ? (
                          charts.openRequestsByUser.map((item) => (
                            <div key={item.label} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="truncate font-medium">
                                  {item.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {item.value}
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-foreground/10">
                                <div
                                  className="h-2 rounded-full bg-[linear-gradient(90deg,#0f3f9a,#0d7adf)]"
                                  style={{
                                    width: `${Math.round(
                                      (item.value /
                                        maxValue(charts.openRequestsByUser)) *
                                        100,
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Sem solicitacoes em aberto.
                          </p>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-muted/80 via-muted/60 to-background">
                      <CardHeader>
                        <CardTitle>Projetos por prioridade</CardTitle>
                        <CardDescription>
                          Distribuicao por nivel de urgência.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {charts?.projectsByPriority.length ? (
                          charts.projectsByPriority.map((item) => (
                            <div key={item.label} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="truncate font-medium">
                                  {item.label}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {item.value}
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-foreground/10">
                                <div
                                  className="h-2 rounded-full bg-emerald-500"
                                  style={{
                                    width: `${Math.round(
                                      (item.value /
                                        maxValue(charts.projectsByPriority)) *
                                        100,
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Nenhum projeto cadastrado.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
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
