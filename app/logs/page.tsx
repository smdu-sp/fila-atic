import { Role } from "@prisma/client";

import { PageHeader } from "@/components/page-header";
import { COORDINATION_ROLES } from "@/lib/roles";
import { searchProjectLogs, type LogSearch } from "@/actions/logActions";
import { AppSidebar } from "@/components/app-sidebar";
import { ListFilters, type FilterField } from "@/components/list-filters";
import { Pagination } from "@/components/pagination";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { getServerAuthSession, requireRole } from "@/lib/auth";
import { firstParam, oneOf, parsePage } from "@/lib/listParams";
import {
  priorityLabels,
  statusLabels,
  taskStatusLabels,
} from "@/lib/projectLabels";

const filterFields: FilterField[] = [
  {
    type: "search",
    name: "q",
    placeholder: "Buscar por texto, projeto ou autor",
  },
  { type: "date", name: "de", label: "De" },
  { type: "date", name: "ate", label: "Até" },
  {
    type: "select",
    name: "tipo",
    label: "Tipo",
    allLabel: "Todos os tipos",
    options: [
      { value: "internal", label: "Atualizações internas" },
      { value: "public", label: "Mensagens ao solicitante" },
    ],
  },
];

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole([...COORDINATION_ROLES, Role.DEV_GLOBAL, Role.DEV_RESTRICTED]);

  const raw = await searchParams;
  const filters = {
    q: firstParam(raw.q),
    de: firstParam(raw.de),
    ate: firstParam(raw.ate),
    tipo: oneOf(raw.tipo, ["internal", "public"] as const),
  };
  const search: LogSearch = {
    q: filters.q,
    from: filters.de,
    to: filters.ate,
    visibility: filters.tipo,
    page: parsePage(raw.page),
  };

  const [result, session] = await Promise.all([
    searchProjectLogs(search),
    getServerAuthSession(),
  ]);
  const page = result.success ? result.data : null;
  const logs = page?.items ?? [];
  const currentUserName = session?.user?.name ?? session?.user?.email ?? "";
  const translateLogMessage = (message: string) => {
    let resultMessage = message;
    Object.entries(statusLabels).forEach(([key, label]) => {
      resultMessage = resultMessage.replaceAll(key, label);
    });
    Object.entries(taskStatusLabels).forEach(([key, label]) => {
      resultMessage = resultMessage.replaceAll(key, label);
    });
    Object.entries(priorityLabels).forEach(([key, label]) => {
      resultMessage = resultMessage.replaceAll(key, label);
    });
    return resultMessage;
  };
  const getMessageContent = (message: string) =>
    message.trim() ? message.trim() : "anexos";
  const getMessageLabel = (authorName: string) =>
    currentUserName && authorName === currentUserName
      ? "Mensagem enviada"
      : "Mensagem recebida";
  const formatLogMessage = (log: (typeof logs)[number]) =>
    log.isInternal
      ? translateLogMessage(log.message)
      : `${getMessageLabel(log.authorName)} [${getMessageContent(log.message)}]`;

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Logs" />
          <div className="grid w-full min-w-0 gap-6 p-4 pt-6 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Logs</h1>
              <p className="text-sm text-muted-foreground">
                Histórico de eventos e comunicações internas.
              </p>
            </div>

            <ListFilters fields={filterFields} />

            <div className="grid gap-3">
              {!result.success ? (
                <div className="text-sm text-destructive">{result.error}</div>
              ) : null}
              <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-primary text-primary-foreground">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-semibold">Alteração</th>
                        <th className="px-4 py-3 font-semibold">Projeto</th>
                        <th className="px-4 py-3 font-semibold">Autor</th>
                        <th className="px-4 py-3 font-semibold">Data e hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-10 text-center text-muted-foreground"
                          >
                            Nenhum registro encontrado com esses filtros.
                          </td>
                        </tr>
                      ) : null}
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b last:border-b-0">
                          <td className="px-4 py-3 font-medium text-foreground">
                            {formatLogMessage(log)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {log.projectTitle}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {log.authorName}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {log.createdAt.toLocaleString("pt-BR")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {page ? (
              <Pagination
                basePath="/logs"
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
