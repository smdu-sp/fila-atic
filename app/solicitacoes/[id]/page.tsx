import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { isCoordination } from "@/lib/roles";
import { Role } from "@prisma/client";
import { FileText } from "lucide-react";

import {
  getProjectDetails,
  listAssignableDevelopers,
  listProjectMessages,
} from "@/actions/solicitacaoActions";
import { UserAvatar } from "@/app/kanban/_components/board-ui";
import { AppSidebar } from "@/components/app-sidebar";
import { DueBadge } from "@/components/due-badge";
import { RequesterActions } from "@/components/requester-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { listTasksByProject } from "@/actions/taskActions";
import { listTaskStatusLabels } from "@/actions/taskStatusActions";
import { getServerAuthSession } from "@/lib/auth";
import { formatDueDate, toDateInput } from "@/lib/dueDate";
import { formatProjectCode } from "@/lib/projectCode";
import { taskStatusLabels as defaultTaskLabels } from "@/lib/projectLabels";
import {
  getCategoryLabel,
  getPriorityLabel,
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/projectLabels";
import { MessageForm } from "@/app/solicitacoes/[id]/_components/message-form";
import { ProjectControls } from "@/app/solicitacoes/[id]/_components/project-controls";
import { ProjectTasksPanel } from "@/app/solicitacoes/[id]/_components/project-tasks-panel";

const sectionLabelClassName =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

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
  const isClosed =
    details.status === "FINISHED" || details.status === "CANCELED";
  // Tasks are internal work: requesters only see the project status.
  const [tasksResult, labelsResult] = isRequester
    ? [null, null]
    : await Promise.all([listTasksByProject(id), listTaskStatusLabels()]);
  const projectTasks = tasksResult?.success ? tasksResult.data : [];
  const taskLabels = labelsResult?.success
    ? labelsResult.data
    : defaultTaskLabels;
  const canRespond =
    isCoordination(session?.user?.role) ||
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
          <PageHeader
            title="Detalhes"
            subtitle={`${formatProjectCode(details.code)} · ${details.title}`}
          />
          <div className="grid w-full min-w-0 gap-4 bg-muted/50 p-4 pt-6 sm:p-6 sm:pt-4">
            <Link
              href="/"
              className="justify-self-end text-sm text-primary underline-offset-4 hover:underline"
            >
              Voltar
            </Link>

            {details.closeReason ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                <p className="text-xs font-semibold uppercase tracking-wide">
                  Motivo do cancelamento
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  {details.closeReason}
                </p>
              </div>
            ) : null}

            {isRequester ? (
              <RequesterActions
                projectId={details.id}
                status={details.status}
                reopenUntil={details.reopenUntil}
              />
            ) : null}

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
              {/* Main column: what the request is, its tasks, the chat. */}
              <div className="grid min-w-0 content-start gap-4">
                <Card>
                  <CardHeader>
                    <p className="font-mono text-xs text-muted-foreground">
                      {formatProjectCode(details.code)}
                    </p>
                    <CardTitle className="text-2xl leading-snug break-words">
                      {details.title}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
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
                      {details.category ? (
                        <Badge variant="outline">
                          {getCategoryLabel(details.category)}
                        </Badge>
                      ) : null}
                      <DueBadge dueDate={details.dueDate} closed={isClosed} />
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <p className={sectionLabelClassName}>Descrição</p>
                      <p className="text-sm whitespace-pre-wrap break-words text-foreground">
                        {details.description}
                      </p>
                    </div>

                    <div className="grid gap-2">
                      <p className={sectionLabelClassName}>Justificativa</p>
                      <p className="text-sm whitespace-pre-wrap break-words text-foreground">
                        {details.justification}
                      </p>
                    </div>

                    {details.customFields.length ? (
                      <div className="grid gap-3">
                        <p className={sectionLabelClassName}>
                          Campos adicionais
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {details.customFields.map((field) => (
                            <div key={field.label} className="min-w-0">
                              <p className="text-xs text-muted-foreground">
                                {field.label}
                              </p>
                              <p className="text-sm font-medium break-words">
                                {field.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                {!isRequester ? (
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
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle>Histórico de mensagens</CardTitle>
                    <CardDescription>
                      Comunicações entre solicitante e equipe.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {!messagesResult.success ? (
                      <div className="text-sm text-destructive">
                        {messagesResult.error}
                      </div>
                    ) : null}
                    {messages.length ? (
                      <div className="grid gap-3">
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
                                    {item.createdAt.toLocaleDateString(
                                      "pt-BR",
                                      {
                                        day: "2-digit",
                                        month: "2-digit",
                                        year: "numeric",
                                      },
                                    )}
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
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
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

                    {isRequester ? (
                      <MessageForm projectId={details.id} />
                    ) : null}
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

              {/* Right sidebar: status/priority controls, team, reporter, dates. */}
              <aside className="grid min-w-0 content-start gap-4 xl:sticky xl:top-4">
                {!isRequester ? (
                  // overflow-x-auto here is a backstop: if this narrow column
                  // ever gets something wider than it (a form field, a long
                  // name) despite min-w-0, it scrolls inside this box instead
                  // of breaking the rest of the page. Check this is still
                  // present before assuming a future overflow report is
                  // something new.
                  <div className="min-w-0 overflow-x-auto rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200/70 dark:bg-sky-950/20 dark:ring-sky-900/40">
                    <ProjectControls
                      projectId={details.id}
                      role={session?.user?.role ?? Role.REQUESTER}
                      defaultStatus={details.status}
                      defaultPriority={details.priority}
                      defaultDueDate={toDateInput(details.dueDate)}
                      defaultCategory={details.category}
                      assignedDevelopers={details.developers.map((dev) => ({
                        id: dev.id,
                        name: dev.name,
                        role: dev.role as Role,
                      }))}
                      assignableDevelopers={assignableDevelopers}
                      variant="sidebar"
                    />
                  </div>
                ) : details.developers.length ? (
                  <Card>
                    <CardContent className="grid gap-1.5">
                      <p className={sectionLabelClassName}>Equipe</p>
                      <ul className="grid gap-1.5">
                        {details.developers.map((dev) => (
                          <li key={dev.id} className="flex items-center gap-2">
                            <UserAvatar name={dev.name} />
                            <span className="min-w-0 flex-1 truncate text-sm">
                              {dev.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardContent className="grid gap-3">
                    <div className="grid min-w-0 gap-1">
                      <p className={sectionLabelClassName}>Solicitante</p>
                      <span className="break-words text-sm font-medium">
                        {details.requester.name}
                      </span>
                      <span className="break-words text-xs text-muted-foreground">
                        {details.requester.department}
                      </span>
                      <span className="break-words text-xs text-muted-foreground">
                        {details.requester.email}
                      </span>
                    </div>
                    <div className="grid gap-1 border-t border-border/60 pt-3">
                      <p className={sectionLabelClassName}>Criado em</p>
                      <span className="text-sm">
                        {details.createdAt.toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    {details.dueDate ? (
                      <div className="grid gap-1 border-t border-border/60 pt-3">
                        <p className={sectionLabelClassName}>
                          Previsão de entrega
                        </p>
                        <span className="text-sm">
                          {formatDueDate(details.dueDate)}
                        </span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </aside>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
