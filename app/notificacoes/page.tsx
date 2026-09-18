import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { searchNotifications } from "@/actions/notificationActions";
import { MarkAllReadButton } from "@/app/notificacoes/_components/mark-all-read-button";
import { AppSidebar } from "@/components/app-sidebar";
import { ListFilters, type FilterField } from "@/components/list-filters";
import {
  NotificationIcon,
  NotificationLink,
} from "@/components/notification-ui";
import { Pagination } from "@/components/pagination";
import { Card, CardContent } from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { getServerAuthSession } from "@/lib/auth";
import { firstParam, parsePage } from "@/lib/listParams";
import { cn } from "@/lib/utils";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Notificações - Fila Atic" };

const filterFields: FilterField[] = [
  { type: "toggle", name: "nao", label: "Só não lidas" },
];

export default async function NotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");

  const raw = await searchParams;
  const filters = { nao: firstParam(raw.nao) === "1" ? "1" : undefined };

  const result = await searchNotifications({
    unread: filters.nao === "1",
    page: parsePage(raw.page),
  });
  const page = result.success ? result.data : null;
  const hasUnread = page?.items.some((item) => item.readAt === null) ?? false;

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Notificações" />
          <div className="grid w-full min-w-0 gap-6 bg-muted/50 p-4 pt-6 sm:p-6 sm:pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold">Notificações</h1>
                <p className="text-sm text-muted-foreground">
                  Avisos sobre solicitações, tarefas e prazos. Você pode
                  desligar os e-mails em Perfil.
                </p>
              </div>
              <MarkAllReadButton disabled={!hasUnread} />
            </div>

            <ListFilters fields={filterFields} />

            <Card>
              <CardContent className="p-0">
                {!result.success ? (
                  <p className="p-4 text-sm text-destructive">{result.error}</p>
                ) : null}
                {page && page.items.length === 0 ? (
                  <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {filters.nao
                      ? "Nenhuma notificação não lida."
                      : "Você ainda não recebeu notificações."}
                  </p>
                ) : null}
                <ul>
                  {page?.items.map((item) => {
                    const unread = item.readAt === null;

                    return (
                      <li key={item.id} className="border-b last:border-b-0">
                        <NotificationLink
                          id={item.id}
                          href={item.href}
                          unread={unread}
                          className={cn(
                            "flex items-start gap-4 px-4 py-4 text-sm transition-colors hover:bg-muted/60",
                            unread && "bg-primary/5",
                          )}
                        >
                          <NotificationIcon
                            kind={item.kind}
                            className="mt-0.5 shrink-0 text-muted-foreground"
                          />
                          <span className="grid min-w-0 flex-1 gap-1">
                            <span
                              className={cn(
                                "leading-snug",
                                unread ? "font-semibold" : "font-medium",
                              )}
                            >
                              {item.title}
                            </span>
                            {item.body ? (
                              <span className="text-xs text-muted-foreground">
                                {item.body}
                              </span>
                            ) : null}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1.5 text-xs text-muted-foreground">
                            {item.createdAt.toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {unread ? (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                                nova
                              </span>
                            ) : null}
                          </span>
                        </NotificationLink>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            {page ? (
              <Pagination
                basePath="/notificacoes"
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
