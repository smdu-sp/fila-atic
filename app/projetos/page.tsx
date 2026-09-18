import { ProjectPriority, ProjectStatus, Role } from "@prisma/client";

import { listAssignableDevelopers } from "@/actions/solicitacaoActions";
import { searchProjects, type ProjectSearch } from "@/actions/projectActions";
import { listProjectRequestFields } from "@/actions/requestFormActions";
import { AppSidebar } from "@/components/app-sidebar";
import { DueBadge } from "@/components/due-badge";
import { ListFilters, type FilterField } from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import { TaskProgress } from "@/components/task-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { CreateProjectForm } from "@/app/projetos/_components/create-project-form";
import { EditProjectDialog } from "@/app/projetos/_components/edit-project-dialog";
import { getServerAuthSession, requireRole } from "@/lib/auth";
import { toDateInput } from "@/lib/dueDate";
import { firstParam, oneOf, parsePage } from "@/lib/listParams";
import {
  getPriorityLabel,
  getStatusBadgeClass,
  getStatusLabel,
  priorityLabels,
  statusLabels,
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

const SORTS = ["due", "updated"] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProjetosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole([Role.COORDINATOR, Role.DEV_GLOBAL, Role.DEV_RESTRICTED]);

  const raw = await searchParams;
  const filters = {
    q: firstParam(raw.q),
    status: oneOf(raw.status, Object.values(ProjectStatus)),
    prioridade: oneOf(raw.prioridade, Object.values(ProjectPriority)),
    dev: firstParam(raw.dev),
    atrasados: firstParam(raw.atrasados) === "1" ? "1" : undefined,
    ordem: oneOf(raw.ordem, SORTS),
  };
  const search: ProjectSearch = {
    q: filters.q,
    status: filters.status,
    priority: filters.prioridade,
    developerId: filters.dev,
    overdue: filters.atrasados === "1",
    sort: filters.ordem,
    page: parsePage(raw.page),
  };

  const [projectsResult, fieldsResult, developersResult, session] =
    await Promise.all([
      searchProjects(search),
      listProjectRequestFields(),
      listAssignableDevelopers(),
      getServerAuthSession(),
    ]);

  const page = projectsResult.success ? projectsResult.data : null;
  const requestFields = fieldsResult.success ? fieldsResult.data : [];
  const developers = developersResult.success ? developersResult.data : [];
  const canManage =
    session?.user?.role === Role.COORDINATOR ||
    session?.user?.role === Role.DEV_GLOBAL;

  const filterFields: FilterField[] = [
    {
      type: "search",
      name: "q",
      placeholder: "Buscar por título, solicitante ou setor",
    },
    {
      type: "select",
      name: "status",
      label: "Status",
      options: Object.values(ProjectStatus).map((value) => ({
        value,
        label: statusLabels[value],
      })),
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
    // restricted developers cannot list people, and only see their own anyway
    ...(developers.length
      ? [
          {
            type: "select",
            name: "dev",
            label: "Responsável",
            options: developers.map((dev) => ({
              value: dev.id,
              label: dev.name,
            })),
          } satisfies FilterField,
        ]
      : []),
    { type: "toggle", name: "atrasados", label: "Só atrasados" },
    {
      type: "select",
      name: "ordem",
      label: "Ordem",
      allLabel: "Mais recentes",
      options: [
        { value: "due", label: "Prazo mais próximo" },
        { value: "updated", label: "Atividade recente" },
      ],
    },
  ];

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="hidden h-16 shrink-0 items-center gap-2 bg-muted/50 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 sm:flex">
            <div className="flex items-center gap-2 px-3 sm:px-4">
              <SidebarTrigger className="-ml-1 md:hidden" />
              <Separator
                orientation="vertical"
                className="mr-2 h-4 md:-ml-4"
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Projetos</span>
              </div>
            </div>
          </header>
          <div className="grid w-full min-w-0 gap-6 bg-muted/50 p-4 pt-6 sm:p-6 sm:pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold">Projetos</h1>
                <p className="text-sm text-muted-foreground">
                  Portfólio de projetos ativos e em planejamento.
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Abrir nova solicitação</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova solicitação</DialogTitle>
                    <DialogDescription>
                      Descreva o que é necessário. A coordenação faz a triagem
                      e a prioridade.
                    </DialogDescription>
                  </DialogHeader>
                  <CreateProjectForm fields={requestFields} />
                </DialogContent>
              </Dialog>
            </div>

            <ListFilters fields={filterFields} />

            <Card>
              <CardContent className="grid gap-3">
                {!projectsResult.success ? (
                  <div className="text-sm text-destructive">
                    {projectsResult.error}
                  </div>
                ) : null}
                {page && page.items.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum projeto encontrado com esses filtros.
                  </p>
                ) : null}
                {page?.items.map((project) => {
                  const closed =
                    project.status === ProjectStatus.FINISHED ||
                    project.status === ProjectStatus.CANCELED;

                  return (
                    <div
                      key={project.id}
                      className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="grid gap-1.5">
                        <Link
                          href={`/solicitacoes/${project.id}`}
                          className="text-sm font-semibold text-foreground hover:underline"
                        >
                          {project.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {project.requesterName} · {project.requesterDepartment}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <TaskProgress
                            done={project.taskDone}
                            total={project.taskTotal}
                          />
                          <DueBadge dueDate={project.dueDate} closed={closed} />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={getStatusBadgeClass(project.status)}
                        >
                          {getStatusLabel(project.status)}
                        </Badge>
                        <Badge variant={priorityVariant[project.priority]}>
                          {getPriorityLabel(project.priority)}
                        </Badge>
                        {canManage ? (
                          <EditProjectDialog
                            projectId={project.id}
                            title={project.title}
                            status={project.status}
                            priority={project.priority}
                            dueDate={toDateInput(project.dueDate)}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {page ? (
              <Pagination
                basePath="/projetos"
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
