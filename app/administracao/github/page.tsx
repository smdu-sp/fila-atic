import { getGithubAdmin } from "@/actions/githubActions";
import { listTaskStatusLabels } from "@/actions/taskStatusActions";
import { GithubSettingsForm } from "@/app/administracao/github/_components/github-settings-form";
import { AppSidebar } from "@/components/app-sidebar";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireRole } from "@/lib/auth";
import { taskStatusLabels } from "@/lib/projectLabels";
import { COORDINATION_ROLES } from "@/lib/roles";

const OUTCOME_LABEL: Record<string, { label: string; className: string }> = {
  processed: { label: "Processado", className: "border-emerald-300 text-emerald-700" },
  ignored: { label: "Ignorado", className: "border-border text-muted-foreground" },
  failed: { label: "Falhou", className: "border-red-300 text-red-700" },
};

const KIND_LABEL: Record<string, string> = {
  ping: "Teste",
  push: "Push",
  pull_request: "Pull request",
  deploy: "Deploy",
};

const formatWhen = (value: Date) =>
  value.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

export default async function GithubAdminPage() {
  await requireRole(COORDINATION_ROLES);

  const [result, labelsResult] = await Promise.all([getGithubAdmin(), listTaskStatusLabels()]);
  const statusLabels = labelsResult.success ? labelsResult.data : taskStatusLabels;

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="Integração com o GitHub" />
          <div className="grid w-full min-w-0 gap-6 p-4 pt-6 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Integração com o GitHub</h1>
              <p className="text-sm text-muted-foreground">
                Commits, pull requests e deploys que citam o código de uma tarefa (ex.:{" "}
                <span className="font-mono">ATC-0001-3</span>) aparecem nela e podem movê-la no
                Kanban. Como instalar o runner no servidor:{" "}
                <span className="font-mono">docs/github-runner.md</span>.
              </p>
            </div>

            {!result.success ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle>Configuração</CardTitle>
                      {result.data.tokenConfigured ? (
                        <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                          Token configurado no servidor
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          Falta GITHUB_INTEGRATION_TOKEN no .env
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      O token (segredo dos workflows) fica no arquivo <span className="font-mono">.env</span>{" "}
                      do servidor, nunca no banco nem nesta tela.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <GithubSettingsForm data={result.data} statusLabels={statusLabels} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Últimos eventos recebidos</CardTitle>
                    <CardDescription>
                      Tudo que os workflows enviaram, inclusive o que foi ignorado e por quê. Se nada
                      aparece aqui, o runner não está chamando o sistema.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result.data.events.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum evento recebido ainda.</p>
                    ) : (
                      <ul className="grid min-w-0 gap-2">
                        {result.data.events.map((event) => {
                          const outcome = OUTCOME_LABEL[event.outcome] ?? OUTCOME_LABEL.ignored;
                          return (
                            <li
                              key={event.id}
                              className="grid min-w-0 gap-1 rounded-lg border border-border/60 px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={outcome.className}>
                                  {outcome.label}
                                </Badge>
                                <span className="font-medium">{KIND_LABEL[event.kind] ?? event.kind}</span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {event.repository}
                                </span>
                                <span className="ms-auto text-xs text-muted-foreground">
                                  {formatWhen(event.createdAt)}
                                </span>
                              </div>
                              <p className="break-words text-muted-foreground">{event.summary}</p>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
