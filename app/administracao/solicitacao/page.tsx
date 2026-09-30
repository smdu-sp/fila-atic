import { COORDINATION_ROLES, isCoordination } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { listProjectRequestFields } from "@/actions/requestFormActions";
import { AppSidebar } from "@/components/app-sidebar";
import { Card, CardContent } from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { getServerAuthSession, requireRole } from "@/lib/auth";
import { RequestFormSettings } from "@/app/administracao/solicitacao/_components/request-form-settings";

export default async function SolicitationAdminPage() {
  await requireRole(COORDINATION_ROLES);

  const [fieldsResult, session] = await Promise.all([
    listProjectRequestFields({ includeInactive: true }),
    getServerAuthSession(),
  ]);

  const canManage = isCoordination(session?.user?.role);

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Administracao de solicitacoes" />
          <div className="w-full min-w-0 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">
                Formulario de solicitação
              </h1>
              <p className="text-sm text-muted-foreground">
                Ajuste os textos e a ordem dos campos usados na abertura de
                projetos.
              </p>
            </div>

            <Card className="mt-6">
              <CardContent className="space-y-4">
                {!canManage ? (
                  <div className="text-sm text-destructive">Sem permissao</div>
                ) : null}
                {canManage && !fieldsResult.success ? (
                  <div className="text-sm text-destructive">
                    {fieldsResult.error}
                  </div>
                ) : null}
                {canManage && fieldsResult.success ? (
                  <RequestFormSettings fields={fieldsResult.data} />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
