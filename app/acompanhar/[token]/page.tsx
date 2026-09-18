import type { Metadata } from "next";
import Link from "next/link";
import { ProjectStatus } from "@prisma/client";
import { FileText } from "lucide-react";

import { GuestMessageForm } from "@/app/acompanhar/[token]/_components/guest-message-form";
import { PublicShell } from "@/app/solicitar/_components/public-shell";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTrackedProject } from "@/lib/guestTracking";
import { UPLOAD_URL_PREFIX } from "@/lib/uploads";
import {
  getPriorityLabel,
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/projectLabels";

// The token in the URL is the credential: keep it out of search engines and
// out of the Referer header sent to anything the page links to.
export const metadata: Metadata = {
  title: "Acompanhar solicitação - Fila Atic",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

const formatDate = (date: Date) =>
  date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export default async function TrackRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const project = await getTrackedProject(token);

  if (!project) {
    return (
      <PublicShell>
        <Card>
          <CardHeader>
            <CardTitle>Solicitação não encontrada</CardTitle>
            <CardDescription>
              Confira o link recebido por e-mail.{" "}
              <Link href="/solicitar" className="underline">
                Abrir uma nova solicitação
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      </PublicShell>
    );
  }

  const isClosed =
    project.status === ProjectStatus.FINISHED ||
    project.status === ProjectStatus.CANCELED;

  return (
    <PublicShell maxWidth="max-w-3xl">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{project.title}</CardTitle>
            <Badge
              variant="outline"
              className={getStatusBadgeClass(project.status)}
            >
              {getStatusLabel(project.status)}
            </Badge>
          </div>
          <CardDescription>
            Aberta em {formatDate(project.createdAt)} por{" "}
            {project.requesterName} · Prioridade{" "}
            {getPriorityLabel(project.priority).toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Descrição
            </p>
            <p className="whitespace-pre-wrap">{project.description}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Justificativa
            </p>
            <p className="whitespace-pre-wrap">{project.justification}</p>
          </div>
          {project.customFields.map((field) => (
            <div key={field.label}>
              <p className="text-xs font-medium text-muted-foreground">
                {field.label}
              </p>
              <p className="whitespace-pre-wrap">{field.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensagens</CardTitle>
          <CardDescription>
            Comunicação entre você e a equipe. Avisaremos por e-mail quando
            houver novidades.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {project.messages.length ? (
            <div className="grid gap-3">
              {project.messages.map((item) => {
                const isOwn = item.authorName === project.requesterName;

                return (
                  <div
                    key={item.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-sm ${
                        isOwn
                          ? "border-primary/20 bg-primary text-primary-foreground"
                          : "border-border/60 bg-muted/60 text-foreground"
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
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                      {item.message ? (
                        <p className="mt-2 whitespace-pre-wrap leading-relaxed">
                          {item.message}
                        </p>
                      ) : null}
                      {item.attachments.length ? (
                        <div className="mt-3 grid gap-2">
                          {item.attachments.map((file) => (
                            <a
                              key={file.id}
                              href={`/acompanhar/${token}/anexos/${file.fileUrl.slice(UPLOAD_URL_PREFIX.length)}`}
                              target="_blank"
                              rel="noreferrer"
                              download={file.fileName}
                              className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/70 px-2 py-1 text-[11px] text-foreground"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <FileText
                                  className="h-4 w-4 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate">{file.fileName}</span>
                              </span>
                              <span>{formatFileSize(file.fileSize)}</span>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma mensagem ainda.
            </p>
          )}

          {isClosed ? (
            <p className="text-sm text-muted-foreground">
              Esta solicitação foi encerrada e não recebe novas mensagens.
            </p>
          ) : (
            <GuestMessageForm token={token} />
          )}
        </CardContent>
      </Card>
    </PublicShell>
  );
}
