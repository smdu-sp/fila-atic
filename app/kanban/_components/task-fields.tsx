"use client";

import type { ReactNode } from "react";
import { ProjectPriority, type TaskStatus } from "@prisma/client";

import { AssigneeItems } from "@/app/kanban/_components/assignee-items";
import { LabelsInput } from "@/components/labels-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getPriorityLabel } from "@/lib/projectLabels";

type Assignee = { id: string; name: string };

// The fields a task has, shared verbatim by the create and the edit dialogs
// so the two never drift apart: same layout, same options, same behavior.
export type TaskFormFieldsProps = {
  // Ids get this prefix, so the create and the edit dialog never collide
  // even though both live in the DOM at the same time.
  idPrefix: string;
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  status: TaskStatus;
  onStatusChange: (value: TaskStatus) => void;
  statusOrder: TaskStatus[];
  statusLabels: Record<TaskStatus, string>;
  priority: ProjectPriority;
  onPriorityChange: (value: ProjectPriority) => void;
  // Only managers reassign a task; everyone else just sees who owns it.
  showAssigneeSelect: boolean;
  assignee: string;
  onAssigneeChange: (value: string) => void;
  assigneeOptions: Assignee[];
  teamIds: string[];
  // Read-only display when there is no picker to show (no permission).
  assigneeName?: string | null;
  dueDate: string;
  onDueDateChange: (value: string) => void;
  labels: string[];
  onLabelsChange: (value: string[]) => void;
  disabled?: boolean;
  // Extra content under the description, inside the main column (attachments
  // and comments, which only make sense once the task already exists).
  mainAfter?: ReactNode;
};

export function TaskFormFields({
  idPrefix,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  status,
  onStatusChange,
  statusOrder,
  statusLabels,
  priority,
  onPriorityChange,
  showAssigneeSelect,
  assignee,
  onAssigneeChange,
  assigneeOptions,
  teamIds,
  assigneeName,
  dueDate,
  onDueDateChange,
  labels,
  onLabelsChange,
  disabled = false,
  mainAfter,
}: TaskFormFieldsProps) {
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
      <div className="grid min-w-0 content-start gap-5">
        <div className="grid gap-1.5">
          <Label htmlFor={id("title")}>Título</Label>
          <Input
            id={id("title")}
            value={title}
            disabled={disabled}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Título da tarefa"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={id("description")}>Descrição</Label>
          <Textarea
            id={id("description")}
            value={description}
            disabled={disabled}
            rows={4}
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="Detalhes, links, critérios de aceite"
          />
        </div>

        {mainAfter}
      </div>

      <aside
        className="grid min-w-0 content-start gap-4"
        aria-label="Dados da tarefa"
      >
        <div className="grid gap-1.5">
          <Label htmlFor={id("status")}>Status</Label>
          <Select
            value={status}
            disabled={disabled}
            onValueChange={(value) => onStatusChange(value as TaskStatus)}
          >
            <SelectTrigger id={id("status")} className="w-full">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusOrder.map((value) => (
                <SelectItem key={value} value={value}>
                  {statusLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("priority")}>Prioridade</Label>
          <Select
            value={priority}
            disabled={disabled}
            onValueChange={(value) =>
              onPriorityChange(value as ProjectPriority)
            }
          >
            <SelectTrigger id={id("priority")} className="w-full">
              <SelectValue placeholder="Prioridade" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ProjectPriority).map((value) => (
                <SelectItem key={value} value={value}>
                  {getPriorityLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showAssigneeSelect ? (
          <div className="grid gap-1.5">
            <Label htmlFor={id("assignee")}>Responsável</Label>
            <Select
              value={assignee}
              disabled={disabled}
              onValueChange={onAssigneeChange}
            >
              <SelectTrigger id={id("assignee")} className="w-full">
                <SelectValue placeholder="Sem responsável" />
              </SelectTrigger>
              <SelectContent>
                <AssigneeItems assignees={assigneeOptions} teamIds={teamIds} />
              </SelectContent>
            </Select>
          </div>
        ) : assigneeName ? (
          <div className="grid gap-1.5">
            <Label>Responsável</Label>
            <span className="text-sm">{assigneeName}</span>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor={id("due")}>Prazo</Label>
          <Input
            id={id("due")}
            type="date"
            value={dueDate}
            disabled={disabled}
            onChange={(event) => onDueDateChange(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("labels")}>Etiquetas</Label>
          <LabelsInput
            id={id("labels")}
            value={labels}
            disabled={disabled}
            onChange={onLabelsChange}
          />
        </div>
      </aside>
    </div>
  );
}
