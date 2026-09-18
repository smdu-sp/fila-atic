import { Role } from "@prisma/client";

import { listProjects } from "@/actions/projectActions";
import { listAssignableDevelopers } from "@/actions/solicitacaoActions";
import { listTaskStatusLabels } from "@/actions/taskStatusActions";
import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { KanbanView } from "@/app/kanban/_components/kanban-view";
import { getServerAuthSession, requireRole } from "@/lib/auth";
import { taskStatusLabels } from "@/lib/projectLabels";

export default async function KanbanPage() {
  await requireRole([Role.COORDINATOR, Role.DEV_GLOBAL, Role.DEV_RESTRICTED]);

  const [projectsResult, labelsResult, developersResult, session] =
    await Promise.all([
      listProjects(),
      listTaskStatusLabels(),
      listAssignableDevelopers(),
      getServerAuthSession(),
    ]);
  const projects = projectsResult.success ? projectsResult.data : [];
  const labels = labelsResult.success ? labelsResult.data : taskStatusLabels;
  const canEditStatusLabels = session?.user?.role === Role.COORDINATOR;
  // Only roles allowed to assign tasks get the list; others get an empty one.
  const assignees = developersResult.success
    ? developersResult.data.map(({ id, name }) => ({ id, name }))
    : [];

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
                <span className="text-sm font-semibold">Kanban</span>
              </div>
            </div>
          </header>
          <div className="w-full min-w-0 bg-muted/50 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
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
              canEditStatusLabels={canEditStatusLabels}
              role={session?.user?.role ?? Role.REQUESTER}
              currentUserId={session?.user?.id ?? ""}
              assignees={assignees}
            />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
