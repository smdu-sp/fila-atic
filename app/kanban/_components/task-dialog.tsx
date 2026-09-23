"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ProjectPriority, TaskStatus } from "@prisma/client";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { updateTask } from "@/actions/taskActions";
import {
  addTaskAttachments,
  addTaskComment,
  deleteTaskAttachment,
  deleteTaskComment,
  getTaskDetails,
  type TaskAttachmentItem,
  type TaskComment,
} from "@/actions/taskDetailActions";
import { UserAvatar } from "@/app/kanban/_components/board-ui";
import { NO_ASSIGNEE } from "@/app/kanban/_components/assignee-items";
import { TaskFormFields } from "@/app/kanban/_components/task-fields";
import type { TaskItem } from "@/app/kanban/_components/task-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toDateInput } from "@/lib/dueDate";
import { MAX_COMMENT_LENGTH } from "@/lib/taskFields";
import {
  formatFileSize,
  MAX_UPLOAD_FILES,
  MAX_UPLOAD_SIZE,
} from "@/lib/uploadLimits";

type Assignee = { id: string; name: string };

export type TaskDialogProps = {
  task: TaskItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statusOrder: TaskStatus[];
  statusLabels: Record<TaskStatus, string>;
  // Empty when the role cannot assign tasks.
  assignees: Assignee[];
  teamIds: string[];
  // Only the owner of a task and managers change its fields.
  canEdit: boolean;
  isManager: boolean;
  currentUserId: string;
  // Called after anything changed, so the board can refresh its cards.
  onChanged: () => void;
};

export function TaskDialog({
  task,
  open,
  onOpenChange,
  ...rest
}: TaskDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        {task ? (
          <TaskDialogBody
            key={task.id}
            task={task}
            onClose={() => onOpenChange(false)}
            {...rest}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const formatDateTime = (value: Date | string) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

function TaskDialogBody({
  task,
  onClose,
  statusOrder,
  statusLabels,
  assignees,
  teamIds,
  canEdit,
  isManager,
  currentUserId,
  onChanged,
}: Omit<TaskDialogProps, "task" | "open" | "onOpenChange"> & {
  task: TaskItem;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<ProjectPriority>(task.priority);
  const [assignee, setAssignee] = useState(task.assigneeId ?? NO_ASSIGNEE);
  const [dueDate, setDueDate] = useState(toDateInput(task.dueDate));
  const [labels, setLabels] = useState(task.labels);

  const [details, setDetails] = useState<{
    comments: TaskComment[];
    attachments: TaskAttachmentItem[];
  } | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [comment, setComment] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // Managers may always pick (even a currently empty list still offers "Sem
  // responsável"); anyone else only sees who owns the task, read-only.
  const canAssign = isManager;
  // The current owner may have left the list of people that can be picked.
  const assigneeOptions =
    task.assigneeId &&
    task.assigneeName &&
    !assignees.some((person) => person.id === task.assigneeId)
      ? [...assignees, { id: task.assigneeId, name: task.assigneeName }]
      : assignees;

  useEffect(() => {
    let cancelled = false;

    getTaskDetails(task.id).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setDetails(result.data);
        setDetailsError(null);
      } else {
        setDetailsError(result.error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [task.id, reloadKey]);

  const refreshDetails = () => {
    setReloadKey((key) => key + 1);
    onChanged();
  };

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Informe o título da tarefa.");
      return;
    }

    startTransition(async () => {
      const result = await updateTask({
        id: task.id,
        title: trimmed,
        description: description.trim() || null,
        dueDate: dueDate || null,
        status,
        priority,
        labels,
        assigneeId: canAssign
          ? assignee === NO_ASSIGNEE
            ? null
            : assignee
          : undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChanged();
      onClose();
    });
  };

  const sendComment = () => {
    if (!comment.trim()) return;

    startTransition(async () => {
      const result = await addTaskComment({
        taskId: task.id,
        message: comment,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setComment("");
      refreshDetails();
    });
  };

  const removeComment = (id: string) =>
    startTransition(async () => {
      const result = await deleteTaskComment(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      refreshDetails();
    });

  const upload = (files: File[]) => {
    // A new key remounts the input, so choosing the same file again works.
    setFileKey((key) => key + 1);
    if (!files.length) return;

    if (files.length > MAX_UPLOAD_FILES) {
      toast.error(`Envie no máximo ${MAX_UPLOAD_FILES} arquivos por vez.`);
      return;
    }
    const tooBig = files.find((file) => file.size > MAX_UPLOAD_SIZE);
    if (tooBig) {
      toast.error(
        `Arquivo acima de ${MAX_UPLOAD_SIZE / 1024 / 1024} MB: ${tooBig.name}`,
      );
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("taskId", task.id);
      files.forEach((file) => formData.append("attachments", file));

      const result = await addTaskAttachments(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      refreshDetails();
    });
  };

  const removeAttachment = (id: string) =>
    startTransition(async () => {
      const result = await deleteTaskAttachment(id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      refreshDetails();
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tarefa</DialogTitle>
        <DialogDescription>
          {task.projectTitle ??
            (canEdit
              ? "Edite os dados, anexe arquivos e comente com a equipe."
              : "Você pode comentar e anexar arquivos; só o responsável e a coordenação alteram os dados.")}
        </DialogDescription>
      </DialogHeader>

      <TaskFormFields
        idPrefix="task-edit"
        title={title}
        onTitleChange={setTitle}
        description={description}
        onDescriptionChange={setDescription}
        status={status}
        onStatusChange={setStatus}
        statusOrder={statusOrder}
        statusLabels={statusLabels}
        priority={priority}
        onPriorityChange={setPriority}
        showAssigneeSelect={canAssign}
        assignee={assignee}
        onAssigneeChange={setAssignee}
        assigneeOptions={assigneeOptions}
        teamIds={teamIds}
        assigneeName={task.assigneeName}
        dueDate={dueDate}
        onDueDateChange={setDueDate}
        labels={labels}
        onLabelsChange={setLabels}
        disabled={!canEdit}
        mainAfter={
          <>
            <section className="grid gap-2" aria-label="Anexos">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-medium">
                  Anexos
                  {details?.attachments.length
                    ? ` (${details.attachments.length})`
                    : ""}
                </h4>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip />
                  Anexar arquivo
                </Button>
                <input
                  key={fileKey}
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) =>
                    upload(Array.from(event.target.files ?? []))
                  }
                />
              </div>
              {detailsError ? (
                <p className="text-sm text-destructive" role="alert">
                  {detailsError}
                </p>
              ) : details === null ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : details.attachments.length ? (
                <ul className="grid gap-1.5">
                  {details.attachments.map((attachment) => (
                    <li
                      key={attachment.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-sm"
                    >
                      <a
                        href={attachment.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-2 hover:text-primary hover:underline"
                      >
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{attachment.fileName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatFileSize(attachment.fileSize)}
                        </span>
                      </a>
                      {isManager ||
                      attachment.uploadedById === currentUserId ? (
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={isPending}
                          aria-label={`Remover anexo ${attachment.fileName}`}
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          <Trash2 />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
              )}
            </section>

            <section className="grid gap-3" aria-label="Comentários">
              <h4 className="text-sm font-medium">
                Comentários
                {details?.comments.length
                  ? ` (${details.comments.length})`
                  : ""}
              </h4>
              {details?.comments.length ? (
                <ul className="grid gap-3">
                  {details.comments.map((item) => (
                    <li key={item.id} className="flex gap-2.5">
                      <UserAvatar name={item.authorName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                          <span className="text-sm font-medium text-foreground">
                            {item.authorName}
                          </span>
                          {formatDateTime(item.createdAt)}
                          {isManager || item.authorId === currentUserId ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => removeComment(item.id)}
                              className="hover:text-destructive hover:underline"
                            >
                              Excluir
                            </button>
                          ) : null}
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm">
                          {item.message}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : details ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum comentário ainda.
                </p>
              ) : null}
              <div className="grid gap-2">
                <Textarea
                  aria-label="Novo comentário"
                  value={comment}
                  rows={2}
                  maxLength={MAX_COMMENT_LENGTH}
                  placeholder="Escreva um comentário (Ctrl+Enter envia)"
                  onChange={(event) => setComment(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.ctrlKey || event.metaKey)
                    ) {
                      event.preventDefault();
                      sendComment();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="justify-self-end"
                  disabled={isPending || !comment.trim()}
                  onClick={sendComment}
                >
                  Comentar
                </Button>
              </div>
            </section>
          </>
        }
      />

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          {canEdit ? "Cancelar" : "Fechar"}
        </Button>
        {canEdit ? (
          <Button onClick={save} disabled={isPending}>
            {isPending ? "Salvando" : "Salvar alterações"}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
