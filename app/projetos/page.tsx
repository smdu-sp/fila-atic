import { ProjectPriority, Role } from "@prisma/client";
import { Pencil } from "lucide-react";

import { listProjects } from "@/actions/projectActions";
import { listProjectRequestFields } from "@/actions/requestFormActions";
import { TaskProgress } from "@/components/task-progress";
import { getServerAuthSession, requireRole } from "@/lib/auth";
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
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { CreateProjectForm } from "@/app/projetos/_components/create-project-form";
import { ProjectUpdateForm } from "@/components/project-update-form";
import {
  getPriorityLabel,
  getStatusBadgeClass,
  getStatusLabel,
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

export default async function ProjetosPage() {
  await requireRole([Role.COORDINATOR, Role.DEV_GLOBAL, Role.DEV_RESTRICTED]);

  const [projectsResult, fieldsResult, session] = await Promise.all([
    listProjects(),
    listProjectRequestFields(),
    getServerAuthSession(),
  ]);

  const projects = projectsResult.success ? projectsResult.data : [];
  const requestFields = fieldsResult.success ? fieldsResult.data : [];
  const canManage =
    session?.user?.role === Role.COORDINATOR ||
    session?.user?.role === Role.DEV_GLOBAL;
  const isRequester = session?.user?.role === Role.REQUESTER;

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="hidden h-16 shrink-0 items-center gap-2 bg-muted/50 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 sm:flex">
            <div className="flex items-center gap-2 px-3 sm:px-4">
              <SidebarTrigger className="-ml-1 md:hidden" />
              <Separator
                orientation="vertical"
                className="mr-2 h-4 md:ml-[-16px]"
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Projetos</span>
              </div>
            </div>
          </header>
          <div className="w-full min-w-0 bg-muted/50 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold">Projetos</h1>
                <p className="text-sm text-muted-foreground">
                  Portifolio de projetos ativos e em planejamento.
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>Abrir nova solicitação</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Nova solicitação</DialogTitle>
                  </DialogHeader>
                  <CreateProjectForm fields={requestFields} />
                </DialogContent>
              </Dialog>
            </div>

            <Card className="mt-6">
              <CardContent className="space-y-4">
                {!projectsResult.success ? (
                  <div className="text-sm text-destructive">
                    {projectsResult.error}
                  </div>
                ) : null}
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <Link
                        href={`/solicitacoes/${project.id}`}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {project.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {project.requesterName} · {project.requesterDepartment}
                      </p>
                      <TaskProgress
                        className="mt-1.5"
                        done={project.taskDone}
                        total={project.taskTotal}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={getStatusBadgeClass(project.status)}
                      >
                        {getStatusLabel(project.status)}
                      </Badge>
                      {!isRequester ? (
                        <Badge variant={priorityVariant[project.priority]}>
                          {getPriorityLabel(project.priority)}
                        </Badge>
                      ) : null}
                      {canManage ? (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="icon-sm"
                              variant="outline"
                              aria-label="Editar status e prioridade"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DialogTrigger>

                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle> Editar projeto </DialogTitle>
                            </DialogHeader>
                            <ProjectUpdateForm
                              projectId={project.id}
                              defaultStatus={project.status}
                              defaultPriority={project.priority}
                            />
                          </DialogContent>
                        </Dialog>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
