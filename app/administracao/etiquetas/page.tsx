import { listLabels } from "@/actions/labelActions";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRole } from "@/lib/auth";
import { COORDINATION_ROLES } from "@/lib/roles";
import { LabelManager } from "@/app/administracao/etiquetas/_components/label-manager";

export default async function LabelsAdminPage() {
  await requireRole(COORDINATION_ROLES);

  const result = await listLabels();

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Etiquetas" />
          <div className="w-full min-w-0 bg-muted/50 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Etiquetas</h1>
              <p className="text-sm text-muted-foreground">
                A lista de etiquetas que a equipe pode usar nas tarefas. Só a
                coordenação cadastra; renomear ou recolorir vale para todas as
                tarefas.
              </p>
            </div>

            <Card className="mt-6">
              <CardContent>
                {result.success ? (
                  <LabelManager labels={result.data} />
                ) : (
                  <div className="text-sm text-destructive">{result.error}</div>
                )}
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
