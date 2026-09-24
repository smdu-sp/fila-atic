import { redirect } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { EmailPreference } from "@/app/perfil/_components/email-preference";
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
import { getServerAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoleLabel } from "@/lib/roles";

export default async function PerfilPage() {
  const session = await getServerAuthSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      login: true,
      name: true,
      email: true,
      department: true,
      role: true,
      createdAt: true,
      isActive: true,
      emailNotifications: true,
    },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Perfil" />
          <div className="w-full min-w-0 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Perfil do usuario</h1>
              <p className="text-sm text-muted-foreground">
                Informacoes sincronizadas do LDAP.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Dados principais</CardTitle>
                  <CardDescription>
                    Nome, login e email utilizados para autenticacao.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Nome</span>
                    <span className="font-medium">{user.name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Login</span>
                    <span className="font-medium">{user.login}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{user.email}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Perfil institucional</CardTitle>
                  <CardDescription>
                    Informacoes de acesso e departamento.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Departamento</span>
                    <span className="font-medium">{user.department}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Role</span>
                    <span className="font-medium">
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-medium">
                      {user.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Criado em</span>
                    <span className="font-medium">
                      {user.createdAt.toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Notificações</CardTitle>
                <CardDescription>
                  Avisos sobre novas solicitações, tarefas atribuídas,
                  mensagens, mudanças de status e prazos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EmailPreference initial={user.emailNotifications} />
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
