"use client";

import { useEffect, useState, useTransition } from "react";
import { ProjectPriority, TaskStatus } from "@prisma/client";
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
import { NO_ASSIGNEE } from "@/app/kanban/_components/assignee-items";
import { TaskFormFields } from "@/app/kanban/_components/task-fields";
import {
  AttachmentsSection,
  CommentsSection,
} from "@/app/kanban/_components/task-extras";
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
import { toDateInput } from "@/lib/dueDate";

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
            <AttachmentsSection
              rows={(details?.attachments ?? []).map((attachment) => ({
                key: attachment.id,
                name: attachment.fileName,
                size: attachment.fileSize,
                href: attachment.fileUrl,
                removable:
                  isManager || attachment.uploadedById === currentUserId,
              }))}
              loading={details === null}
              error={detailsError}
              disabled={isPending}
              onPick={upload}
              onRemove={removeAttachment}
            />
            <CommentsSection
              rows={(details?.comments ?? []).map((item) => ({
                key: item.id,
                authorName: item.authorName,
                when: formatDateTime(item.createdAt),
                message: item.message,
                removable: isManager || item.authorId === currentUserId,
              }))}
              loaded={details !== null}
              disabled={isPending}
              draft={comment}
              onDraftChange={setComment}
              onSend={sendComment}
              onRemove={removeComment}
            />
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
