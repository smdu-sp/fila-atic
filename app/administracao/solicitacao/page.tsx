import { Role } from "@prisma/client";

import { listProjectRequestFields } from "@/actions/requestFormActions";
import { AppSidebar } from "@/components/app-sidebar";
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
import { getServerAuthSession } from "@/lib/auth";
import { RequestFormSettings } from "@/app/administracao/solicitacao/_components/request-form-settings";

export default async function SolicitationAdminPage() {
  const [fieldsResult, session] = await Promise.all([
    listProjectRequestFields({ includeInactive: true }),
    getServerAuthSession(),
  ]);

  const canManage = session?.user?.role === Role.COORDINATOR;

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
                <span className="text-xs text-muted-foreground"></span>
                <span className="text-sm font-semibold">
                  Administracao de solicitacoes
                </span>
              </div>
            </div>
          </header>
          <div className="w-full min-w-0 bg-muted/50 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
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
