import Link from "next/link";
import { Role } from "@prisma/client";
import { FileText } from "lucide-react";

import {
  getProjectDetails,
  listAssignableDevelopers,
  listProjectMessages,
} from "@/actions/solicitacaoActions";
import { AppSidebar } from "@/components/app-sidebar";
import { DueBadge } from "@/components/due-badge";
import { Badge } from "@/components/ui/badge";
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
import { listTasksByProject } from "@/actions/taskActions";
import { listTaskStatusLabels } from "@/actions/taskStatusActions";
import { getServerAuthSession } from "@/lib/auth";
import { formatDueDate, toDateInput } from "@/lib/dueDate";
import { taskStatusLabels as defaultTaskLabels } from "@/lib/projectLabels";
import {
  getPriorityLabel,
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/projectLabels";
import { MessageForm } from "@/app/solicitacoes/[id]/_components/message-form";
import { ProjectControls } from "@/app/solicitacoes/[id]/_components/project-controls";
import { ProjectTasksPanel } from "@/app/solicitacoes/[id]/_components/project-tasks-panel";

export default async function SolicitacaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detailsResult, messagesResult, developersResult, session] =
    await Promise.all([
      getProjectDetails(id),
      listProjectMessages(id),
      listAssignableDevelopers(),
      getServerAuthSession(),
    ]);

  if (!detailsResult.success) {
    return (
      <div className="relative w-full overflow-x-hidden">
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <div className="p-6">
              <p className="text-sm text-destructive">{detailsResult.error}</p>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    );
  }

  const details = detailsResult.data;
  const messages = messagesResult.success ? messagesResult.data : [];
  const isRequester = session?.user?.role === Role.REQUESTER;
  // Tasks are internal work: requesters only see the project status.
  const [tasksResult, labelsResult] = isRequester
    ? [null, null]
    : await Promise.all([listTasksByProject(id), listTaskStatusLabels()]);
  const projectTasks = tasksResult?.success ? tasksResult.data : [];
  const taskLabels = labelsResult?.success ? labelsResult.data : defaultTaskLabels;
  const canRespond =
    session?.user?.role === Role.COORDINATOR ||
    session?.user?.role === Role.DEV_GLOBAL;
  const currentUserName = session?.user?.name ?? "";
  const assignableDevelopers = developersResult.success
    ? developersResult.data
    : [];
  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };
  const truncateFileName = (name: string, maxLength = 30) =>
    name.length > maxLength ? `${name.slice(0, maxLength - 3)}...` : name;

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
                <span className="text-sm font-semibold">Detalhes</span>
                <span className="text-xs text-muted-foreground">
                  {details.title}
                </span>
              </div>
            </div>
          </header>
          <div className="w-full min-w-0 p-4 pt-6 sm:gap-4 sm:p-6 sm:pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold">Detalhes do chamado</h1>
                <p className="text-sm text-muted-foreground">
                  Acompanhe as informacoes e mensagens do chamado.
                </p>
              </div>
              <Link
                href="/"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                Voltar
              </Link>
            </div>

            {!isRequester ? (
              <div className="mt-3">
                <ProjectControls
                  projectId={details.id}
                  role={session?.user?.role ?? Role.REQUESTER}
                  defaultStatus={details.status}
                  defaultPriority={details.priority}
                  defaultDueDate={toDateInput(details.dueDate)}
                  assignedDevelopers={details.developers.map((dev) => ({
                    id: dev.id,
                    name: dev.name,
                    role: dev.role as Role,
                  }))}
                  assignableDevelopers={assignableDevelopers}
                  variant="inline"
                />
              </div>
            ) : null}

            <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>{details.title}</CardTitle>
                  <CardDescription>
                    Criado em {details.createdAt.toLocaleDateString("pt-BR")}
                    {details.dueDate
                      ? ` · Previsão de entrega ${formatDueDate(details.dueDate)}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={getStatusBadgeClass(details.status)}
                    >
                      {getStatusLabel(details.status)}
                    </Badge>
                    {!isRequester ? (
                      <Badge variant="secondary">
                        {getPriorityLabel(details.priority)}
                      </Badge>
                    ) : null}
                    <DueBadge
                      dueDate={details.dueDate}
                      closed={
                        details.status === "FINISHED" ||
                        details.status === "CANCELED"
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Solicitante
                    </p>
                    <div className="grid gap-1">
                      <span className="font-medium">
                        {details.requester.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {details.requester.department}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {details.requester.email}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Descricao
                    </p>
                    <p className="text-sm text-foreground">
                      {details.description}
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Justificativa
                    </p>
                    <p className="text-sm text-foreground">
                      {details.justification}
                    </p>
                  </div>

                  {details.customFields.length ? (
                    <div className="grid gap-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Campos adicionais
                      </p>
                      <div className="grid gap-2">
                        {details.customFields.map((field) => (
                          <div key={field.label}>
                            <p className="text-xs text-muted-foreground">
                              {field.label}
                            </p>
                            <p className="text-sm font-medium">{field.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {details.developers.length ? (
                    <div className="grid gap-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Desenvolvedores
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {details.developers.map((dev) => (
                          <Badge key={dev.id} variant="outline">
                            {dev.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle>Historico de mensagens</CardTitle>
                  <CardDescription>
                    Comunicacoes entre solicitante e equipe.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  {!messagesResult.success ? (
                    <div className="text-sm text-destructive">
                      {messagesResult.error}
                    </div>
                  ) : null}
                  {messages.length ? (
                    <div className="flex flex-1 flex-col gap-3">
                      {messages.map((item) => {
                        const isOwn = item.authorName === currentUserName;
                        const attachmentClasses = isOwn
                          ? "border-primary/30 bg-primary/10 text-primary-foreground"
                          : "border-border/60 bg-background/70 text-foreground";

                        return (
                          <div
                            key={item.id}
                            className={`flex ${
                              isOwn ? "justify-end" : "justify-start"
                            }`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                                isOwn
                                  ? "bg-primary text-primary-foreground border-primary/20"
                                  : "bg-muted/60 text-foreground border-border/60"
                              }`}
                            >
                              <div
                                className={`flex flex-wrap items-center justify-between gap-2 text-[11px] ${
                                  isOwn
                                    ? "text-primary-foreground/70"
                                    : "text-muted-foreground"
                                }`}
                              >
                                <span>{item.authorName}</span>
                                <span>
                                  {item.createdAt.toLocaleDateString("pt-BR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                  })}
                                </span>
                              </div>
                              {item.message ? (
                                <p className="mt-2 text-sm leading-relaxed">
                                  {item.message}
                                </p>
                              ) : null}
                              {item.attachments.length ? (
                                <div className="mt-3 grid gap-2">
                                  {item.attachments.map((file) =>
                                    file.fileType?.startsWith("image/") ? (
                                      <a
                                        key={file.id}
                                        href={file.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`block overflow-hidden rounded-lg border ${attachmentClasses}`}
                                        download={file.fileName}
                                      >
                                        <img
                                          src={file.fileUrl}
                                          alt={file.fileName}
                                          className="h-40 w-full object-cover"
                                        />
                                        <div className="flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
                                          <span className="truncate">
                                            {truncateFileName(file.fileName)}
                                          </span>
                                          <span>
                                            {formatFileSize(file.fileSize)}
                                          </span>
                                        </div>
                                      </a>
                                    ) : (
                                      <a
                                        key={file.id}
                                        href={file.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-[11px] ${attachmentClasses}`}
                                        download={file.fileName}
                                      >
                                        <span className="flex min-w-0 items-center gap-2">
                                          <FileText
                                            className="h-4 w-4 shrink-0"
                                            aria-hidden="true"
                                          />
                                          <span className="truncate">
                                            {truncateFileName(file.fileName)}
                                          </span>
                                        </span>
                                        <span>
                                          {formatFileSize(file.fileSize)}
                                        </span>
                                      </a>
                                    ),
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma mensagem registrada.
                    </p>
                  )}

                  {isRequester ? <MessageForm projectId={details.id} /> : null}
                  {canRespond ? (
                    <MessageForm
                      projectId={details.id}
                      triggerLabel="Responder"
                      dialogTitle="Enviar resposta"
                      dialogDescription="Escreva uma resposta para o solicitante."
                      successMessage="Resposta enviada."
                    />
                  ) : null}
                </CardContent>
              </Card>
            </div>

            {!isRequester ? (
              <div className="mt-4">
                <ProjectTasksPanel
                  projectId={details.id}
                  projectStatus={details.status}
                  role={session?.user?.role ?? Role.REQUESTER}
                  tasks={projectTasks}
                  taskLabels={taskLabels}
                  team={details.developers.map((dev) => ({
                    id: dev.id,
                    name: dev.name,
                  }))}
                  assignableDevelopers={assignableDevelopers.map((dev) => ({
                    id: dev.id,
                    name: dev.name,
                  }))}
                />
              </div>
            ) : null}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
