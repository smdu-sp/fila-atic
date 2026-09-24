"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ProjectPriority, TaskStatus } from "@prisma/client";

import { createTask } from "@/actions/taskActions";
import { addTaskAttachments, addTaskComment } from "@/actions/taskDetailActions";
import { NO_ASSIGNEE } from "@/app/kanban/_components/assignee-items";
import { TaskFormFields } from "@/app/kanban/_components/task-fields";
import {
  AttachmentsSection,
  CommentsSection,
} from "@/app/kanban/_components/task-extras";
import { TASK_STATUS_ORDER } from "@/app/kanban/_components/task-types";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_UPLOAD_FILES } from "@/lib/uploadLimits";

type ProjectOption = { id: string; title: string };
type Assignee = { id: string; name: string };

type CreateTaskFormProps = {
  projects: ProjectOption[];
  initialProjectId?: string;
  initialStatus?: TaskStatus;
  hideProjectSelect?: boolean;
  statusLabels: Record<TaskStatus, string>;
  // Empty (and no picker shown) when the current role cannot assign tasks.
  isManager?: boolean;
  assignees?: Assignee[];
  // Members of the project: listed first in the assignee picker.
  teamIds?: string[];
  onCreated?: () => void;
};

type FormState = {
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: ProjectPriority;
  assignee: string;
  dueDate: string;
  labels: string[];
};

const blank = (projectId: string, status?: TaskStatus): FormState => ({
  projectId,
  title: "",
  description: "",
  status: status ?? TASK_STATUS_ORDER[0],
  priority: ProjectPriority.MEDIUM,
  assignee: NO_ASSIGNEE,
  dueDate: "",
  labels: [],
});

// Same fields, same layout and the same behavior as the dialog opened by
// clicking an existing task (see TaskDialog). Attachments and comments cannot
// be saved before the task exists, so they are kept on this screen and sent
// right after the task is created.
export function CreateTaskForm({
  projects,
  initialProjectId,
  initialStatus,
  hideProjectSelect = false,
  statusLabels,
  isManager = false,
  assignees = [],
  teamIds = [],
  onCreated,
}: CreateTaskFormProps) {
  // The dialog that hosts this form unmounts it when closed, so a fresh
  // mount (not an effect) is what resets the fields for the next project or
  // column; see TaskDialog's `key={task.id}` for the same pattern.
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(() =>
    blank(initialProjectId ?? "", initialStatus),
  );
  const [titleError, setTitleError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [comments, setComments] = useState<string[]>([]);
  const [commentDraft, setCommentDraft] = useState("");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = () => {
    const title = form.title.trim();
    if (title.length < 3) {
      setTitleError("Informe o título (pelo menos 3 caracteres)");
      return;
    }
    if (!form.projectId) {
      toast.error("Selecione um projeto.");
      return;
    }
    setTitleError(null);

    startTransition(async () => {
      const result = await createTask({
        projectId: form.projectId,
        title,
        description: form.description.trim() || undefined,
        status: form.status,
        priority: form.priority,
        assigneeId:
          isManager && form.assignee !== NO_ASSIGNEE ? form.assignee : null,
        dueDate: form.dueDate || null,
        labels: form.labels,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      // The comment that is typed but not "sent" yet still counts.
      const pendingComments = commentDraft.trim()
        ? [...comments, commentDraft]
        : comments;
      const failures: string[] = [];

      for (const message of pendingComments) {
        const sent = await addTaskComment({ taskId: result.data, message });
        if (!sent.success) failures.push(sent.error);
      }
      if (files.length) {
        const formData = new FormData();
        formData.set("taskId", result.data);
        files.forEach((file) => formData.append("attachments", file));
        const sent = await addTaskAttachments(formData);
        if (!sent.success) failures.push(sent.error);
      }

      if (failures.length) {
        toast.warning(
          `Tarefa criada, mas nem tudo foi salvo: ${failures.join("; ")}. Abra a tarefa para tentar de novo.`,
        );
      } else {
        toast.success("Tarefa criada.");
      }
      setForm(blank(form.projectId, form.status));
      setFiles([]);
      setComments([]);
      setCommentDraft("");
      onCreated?.();
    });
  };

  return (
    <div className="grid gap-4">
      {hideProjectSelect ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor="task-create-project">Projeto</Label>
          <Select
            value={form.projectId}
            onValueChange={(value) => set("projectId", value)}
          >
            <SelectTrigger id="task-create-project" className="w-full">
              <SelectValue placeholder="Selecione o projeto" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <TaskFormFields
        idPrefix="task-create"
        title={form.title}
        onTitleChange={(value) => {
          set("title", value);
          if (titleError) setTitleError(null);
        }}
        description={form.description}
        onDescriptionChange={(value) => set("description", value)}
        status={form.status}
        onStatusChange={(value) => set("status", value)}
        statusOrder={TASK_STATUS_ORDER}
        statusLabels={statusLabels}
        priority={form.priority}
        onPriorityChange={(value) => set("priority", value)}
        showAssigneeSelect={isManager}
        assignee={form.assignee}
        onAssigneeChange={(value) => set("assignee", value)}
        assigneeOptions={assignees}
        teamIds={teamIds}
        dueDate={form.dueDate}
        onDueDateChange={(value) => set("dueDate", value)}
        labels={form.labels}
        onLabelsChange={(value) => set("labels", value)}
        mainAfter={
          <>
            <AttachmentsSection
              rows={files.map((file, index) => ({
                key: String(index),
                name: file.name,
                size: file.size,
                removable: true,
              }))}
              disabled={isPending}
              onPick={(picked) => {
                if (files.length + picked.length > MAX_UPLOAD_FILES) {
                  toast.error(
                    `Envie no máximo ${MAX_UPLOAD_FILES} arquivos por tarefa nova.`,
                  );
                  return;
                }
                setFiles((prev) => [...prev, ...picked]);
              }}
              onRemove={(key) =>
                setFiles((prev) => prev.filter((_, i) => String(i) !== key))
              }
            />
            <CommentsSection
              rows={comments.map((message, index) => ({
                key: String(index),
                authorName: "Você",
                when: "será enviado ao criar a tarefa",
                message,
                removable: true,
              }))}
              disabled={isPending}
              draft={commentDraft}
              onDraftChange={setCommentDraft}
              onSend={() => {
                if (!commentDraft.trim()) return;
                setComments((prev) => [...prev, commentDraft]);
                setCommentDraft("");
              }}
              onRemove={(key) =>
                setComments((prev) => prev.filter((_, i) => String(i) !== key))
              }
            />
          </>
        }
      />
      {titleError ? (
        <span className="-mt-2 text-xs text-destructive">{titleError}</span>
      ) : null}

      <DialogFooter>
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Criando" : "Criar tarefa"}
        </Button>
      </DialogFooter>
    </div>
  );
}
