import { ProjectPriority } from "@prisma/client";

import { listQueueProjects } from "@/actions/queueActions";
import { AppSidebar } from "@/components/app-sidebar";
import { Badge } from "@/components/ui/badge";
import {
  getPriorityLabel,
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/projectLabels";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ProjectUpdateForm } from "@/components/project-update-form";

const priorityVariant: Record<
  ProjectPriority,
  "default" | "secondary" | "destructive"
> = {
  LOW: "default",
  MEDIUM: "secondary",
  HIGH: "destructive",
  URGENT: "destructive",
};

export default async function FilaPage() {
  const result = await listQueueProjects();
  const projects = result.success ? result.data : [];
  const totalQueue = projects.length;
  const highPriority = projects.filter(
    (project) =>
      project.priority === ProjectPriority.HIGH ||
      project.priority === ProjectPriority.URGENT,
  ).length;
  const urgentPriority = projects.filter(
    (project) => project.priority === ProjectPriority.URGENT,
  ).length;

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
                <span className="text-sm font-semibold">Fila de demandas</span>
              </div>
            </div>
          </header>
          <div className="w-full min-w-0 bg-muted/50 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Fila de demandas</h1>
              <p className="text-sm text-muted-foreground">
                Priorize e acompanhe as novas solicitacoes recebidas.
              </p>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                { label: "Total na fila", value: String(totalQueue) },
                { label: "Prioridade alta", value: String(highPriority) },
                { label: "Urgentes", value: String(urgentPriority) },
              ].map((item) => (
                <Card key={item.label}>
                  <CardHeader className="pb-2">
                    <CardDescription>{item.label}</CardDescription>
                    <CardTitle className="text-3xl">{item.value}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Demandas aguardando avaliacao</CardTitle>
                <CardDescription>
                  Confirme escopo, prioridade e designacao inicial.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!result.success ? (
                  <div className="text-sm text-destructive">{result.error}</div>
                ) : null}
                {projects.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <Link
                        href={`/solicitacoes/${item.id}`}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.requesterName} · {item.requesterDepartment}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={priorityVariant[item.priority]}>
                        {getPriorityLabel(item.priority)}
                      </Badge>
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
                        compact
                      />
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
