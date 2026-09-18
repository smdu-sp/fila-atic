import { COORDINATION_ROLES } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { listUsers } from "@/actions/userActions";
import { requireRole } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { UsersTable } from "@/app/usuarios/_components/users-table";

export default async function UsuariosPage() {
  await requireRole(COORDINATION_ROLES);

  const result = await listUsers();
  const users = result.success ? result.data : [];

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Usuarios" />
          <div className="w-full min-w-0 bg-muted/50 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Usuarios</h1>
              <p className="text-sm text-muted-foreground">
                Controle de acesso e perfis cadastrados.
              </p>
            </div>

            <Card className="mt-6">
              <CardContent className="space-y-4">
                {!result.success ? (
                  <div className="text-sm text-destructive">{result.error}</div>
                ) : null}
                {result.success ? <UsersTable users={users} /> : null}
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
