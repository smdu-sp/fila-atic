import {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
  Role,
} from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { COORDINATION_ROLES, isCoordination } from "@/lib/roles";
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
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CreateProjectForm } from "@/app/projetos/_components/create-project-form";
import { EditProjectDialog } from "@/app/projetos/_components/edit-project-dialog";
import { getServerAuthSession, requireRole } from "@/lib/auth";
import { toDateInput } from "@/lib/dueDate";
import { firstParam, oneOf, parsePage } from "@/lib/listParams";
import { formatProjectCode } from "@/lib/projectCode";
import {
  categoryLabels,
  getCategoryLabel,
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
  await requireRole([
    ...COORDINATION_ROLES,
    Role.DEV_GLOBAL,
    Role.DEV_RESTRICTED,
  ]);

  const raw = await searchParams;
  const filters = {
    q: firstParam(raw.q),
    status: oneOf(raw.status, Object.values(ProjectStatus)),
    prioridade: oneOf(raw.prioridade, Object.values(ProjectPriority)),
    categoria: oneOf(raw.categoria, Object.values(ProjectCategory)),
    dev: firstParam(raw.dev),
    atrasados: firstParam(raw.atrasados) === "1" ? "1" : undefined,
    ordem: oneOf(raw.ordem, SORTS),
  };
  const search: ProjectSearch = {
    q: filters.q,
    status: filters.status,
    priority: filters.prioridade,
    category: filters.categoria,
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
    isCoordination(session?.user?.role) ||
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
    {
      type: "select",
      name: "categoria",
      label: "Categoria",
      options: Object.values(ProjectCategory).map((value) => ({
        value,
        label: categoryLabels[value],
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
          <PageHeader title="Projetos" />
          <div className="grid w-full min-w-0 gap-6 p-4 pt-6 sm:p-6 sm:pt-4">
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
                      Descreva o que é necessário. A coordenação faz a triagem e
                      a prioridade.
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
                          className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground hover:underline"
                        >
                          <span className="font-mono text-xs font-normal text-muted-foreground">
                            {formatProjectCode(project.code)}
                          </span>
                          {project.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {project.requesterName} ·{" "}
                          {project.requesterDepartment}
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
                        {project.category ? (
                          <Badge variant="outline">
                            {getCategoryLabel(project.category)}
                          </Badge>
                        ) : null}
                        {canManage ? (
                          <EditProjectDialog
                            projectId={project.id}
                            code={project.code}
                            title={project.title}
                            status={project.status}
                            priority={project.priority}
                            dueDate={toDateInput(project.dueDate)}
                            category={project.category}
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
