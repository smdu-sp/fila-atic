import { getMailStatus } from "@/actions/mailActions";
import { TestEmailForm } from "@/app/administracao/email/_components/test-email-form";
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
import { getServerAuthSession, requireRole } from "@/lib/auth";
import { COORDINATION_ROLES } from "@/lib/roles";

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  sent: { label: "Enviado", className: "border-emerald-300 text-emerald-700" },
  skipped: { label: "Console (SMTP não configurado)", className: "border-border text-muted-foreground" },
  failed: { label: "Falhou", className: "border-red-300 text-red-700" },
};

const KIND_LABEL: Record<string, string> = {
  confirmation: "Confirmação de solicitação",
  tracking: "Link de acompanhamento",
  guest_update: "Aviso a solicitante externo",
  notification: "Notificação",
  test: "Teste",
  other: "Outro",
};

const formatWhen = (value: Date) =>
  value.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: "America/Sao_Paulo" });

export default async function EmailAdminPage() {
  await requireRole(COORDINATION_ROLES);

  const [result, session] = await Promise.all([getMailStatus(), getServerAuthSession()]);

  return (
    <div className="relative w-full overflow-x-hidden">
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <PageHeader title="E-mail" />
          <div className="grid w-full min-w-0 gap-6 p-4 pt-6 sm:p-6 sm:pt-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">E-mail</h1>
              <p className="text-sm text-muted-foreground">
                O Fila ATIC não envia e-mail diretamente: ele se conecta a um servidor de e-mail
                (relay) que faz a entrega de fato, o mesmo modelo do runner do GitHub — só precisa
                de conexão de saída para esse servidor. Como configurar:{" "}
                <span className="font-mono">README.md</span>, seção &quot;E-mail&quot;.
              </p>
            </div>

            {!result.success ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle>Conexão com o servidor de e-mail</CardTitle>
                      {result.data.configured ? (
                        <Badge variant="outline" className="border-emerald-300 text-emerald-700">
                          SMTP_HOST configurado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          Falta SMTP_HOST no .env
                        </Badge>
                      )}
                    </div>
                    <CardDescription>
                      Host, porta e remetente só são visíveis aqui; usuário e senha ficam no{" "}
                      <span className="font-mono">.env</span> do servidor.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {result.data.configured ? (
                      <dl className="grid min-w-0 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                        <div className="flex justify-between gap-2 sm:justify-start">
                          <dt className="text-muted-foreground">Servidor</dt>
                          <dd className="font-mono">
                            {result.data.host}:{result.data.port}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2 sm:justify-start">
                          <dt className="text-muted-foreground">Conexão</dt>
                          <dd>
                            {result.data.secure ? "TLS implícito" : "STARTTLS (se o servidor oferecer)"}
                            {result.data.rejectUnauthorized ? "" : " · certificado não verificado"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2 sm:justify-start">
                          <dt className="text-muted-foreground">Autenticação</dt>
                          <dd>{result.data.authenticated ? "Usuário e senha" : "Sem login (relay aberto para este servidor)"}</dd>
                        </div>
                        <div className="flex justify-between gap-2 sm:justify-start">
                          <dt className="text-muted-foreground">Remetente</dt>
                          <dd className="min-w-0 truncate font-mono">{result.data.from ?? "—"}</dd>
                        </div>
                      </dl>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Sem <span className="font-mono">SMTP_HOST</span>, fora de produção os e-mails só
                        são impressos no console do servidor (nada é entregue de verdade); em produção,
                        o envio falha.
                      </p>
                    )}
                    <TestEmailForm defaultEmail={session?.user?.email ?? ""} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Últimos e-mails</CardTitle>
                    <CardDescription>
                      Confirmações, links de acompanhamento, avisos a solicitantes externos e
                      notificações à equipe, com o resultado do envio. Guardados por 30 dias.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {result.data.recent.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum e-mail registrado ainda.</p>
                    ) : (
                      <ul className="grid min-w-0 gap-2">
                        {result.data.recent.map((entry) => {
                          const status = STATUS_LABEL[entry.status] ?? STATUS_LABEL.failed;
                          return (
                            <li
                              key={entry.id}
                              className="grid min-w-0 gap-1 rounded-lg border border-border/60 px-3 py-2 text-sm"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className={status.className}>
                                  {status.label}
                                </Badge>
                                <span className="font-medium">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
                                <span className="min-w-0 truncate text-xs text-muted-foreground">
                                  {entry.to}
                                </span>
                                <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                                  {formatWhen(entry.createdAt)}
                                </span>
                              </div>
                              <p className="min-w-0 truncate text-muted-foreground">{entry.subject}</p>
                              {entry.error ? (
                                <p className="break-words text-xs text-destructive">{entry.error}</p>
                              ) : null}
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
