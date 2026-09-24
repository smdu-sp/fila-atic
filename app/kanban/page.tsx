import { Role } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { COORDINATION_ROLES, isCoordination } from "@/lib/roles";
import { listLabels } from "@/actions/labelActions";
import { listProjects } from "@/actions/projectActions";
import { listAssignableDevelopers } from "@/actions/solicitacaoActions";
import { listTaskStatusLabels } from "@/actions/taskStatusActions";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { KanbanView } from "@/app/kanban/_components/kanban-view";
import { getServerAuthSession, requireRole } from "@/lib/auth";
import { taskStatusLabels } from "@/lib/projectLabels";

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: Promise<{ projeto?: string }>;
}) {
  await requireRole([...COORDINATION_ROLES, Role.DEV_GLOBAL, Role.DEV_RESTRICTED]);
  // /kanban?projeto=<id> opens the task board of that project
  const { projeto } = await searchParams;

  const [projectsResult, labelsResult, developersResult, paletteResult, session] =
    await Promise.all([
      listProjects(),
      listTaskStatusLabels(),
      listAssignableDevelopers(),
      listLabels(),
      getServerAuthSession(),
    ]);
  const projects = projectsResult.success ? projectsResult.data : [];
  const labels = labelsResult.success ? labelsResult.data : taskStatusLabels;
  const canEditStatusLabels = isCoordination(session?.user?.role);
  // Only roles allowed to assign tasks get the list; others get an empty one.
  const assignees = developersResult.success
    ? developersResult.data.map(({ id, name }) => ({ id, name }))
    : [];

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Kanban" />
          <div className="w-full min-w-0 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Kanban</h1>
              <p className="text-sm text-muted-foreground">
                Visualize o andamento das entregas por etapa.
              </p>
            </div>
            {!projectsResult.success ? (
              <div className="mt-4 text-sm text-destructive">
                {projectsResult.error}
              </div>
            ) : null}
            <KanbanView
              projects={projects}
              taskStatusLabels={labels}
              labelPalette={paletteResult.success ? paletteResult.data : []}
              canManageLabels={canEditStatusLabels}
              canEditStatusLabels={canEditStatusLabels}
              role={session?.user?.role ?? Role.REQUESTER}
              currentUserId={session?.user?.id ?? ""}
              assignees={assignees}
              initialProjectId={projeto}
              initialTab={projeto ? "tasks" : "projects"}
            />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
