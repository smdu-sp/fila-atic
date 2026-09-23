"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ProjectPriority } from "@prisma/client";
import {
  Briefcase,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ChevronsUp,
  Equal,
  MessageSquare,
  Paperclip,
  Plus,
  User,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { updateTask } from "@/actions/taskActions";
import {
  AssigneeButtons,
  NO_ASSIGNEE,
} from "@/app/kanban/_components/assignee-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DueBadge } from "@/components/due-badge";
import { LabelsInput } from "@/components/labels-input";
import { TaskProgress } from "@/components/task-progress";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatProjectCode } from "@/lib/projectCode";
import { getPriorityLabel } from "@/lib/projectLabels";
import { cn } from "@/lib/utils";

const priorityMeta: Record<
  ProjectPriority,
  { icon: LucideIcon; className: string }
> = {
  LOW: { icon: ChevronDown, className: "text-sky-600 dark:text-sky-400" },
  MEDIUM: { icon: Equal, className: "text-amber-500" },
  HIGH: { icon: ChevronUp, className: "text-orange-600 dark:text-orange-400" },
  URGENT: { icon: ChevronsUp, className: "text-red-600 dark:text-red-400" },
};

export function PriorityIcon({ priority }: { priority: ProjectPriority }) {
  const { icon: Icon, className } = priorityMeta[priority];
  const label = `Prioridade ${getPriorityLabel(priority).toLowerCase()}`;

  return (
    <span title={label} aria-label={label} className={className}>
      <Icon className="size-4" strokeWidth={2.5} />
    </span>
  );
}

// The priority icon as a button that opens a one-click picker, for the
// Trello-style quick edits on a task card.
function PriorityPicker({
  priority,
  onPick,
  disabled,
}: {
  priority: ProjectPriority;
  onPick: (value: ProjectPriority) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (disabled) return <PriorityIcon priority={priority} />;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Alterar prioridade"
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => event.stopPropagation()}
        >
          <PriorityIcon priority={priority} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid gap-0.5">
          {Object.values(ProjectPriority).map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent hover:text-accent-foreground",
                value === priority && "bg-accent text-accent-foreground",
              )}
              onClick={() => {
                setOpen(false);
                if (value !== priority) onPick(value);
              }}
            >
              <PriorityIcon priority={value} />
              {getPriorityLabel(value)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const avatarColors = [
  "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200",
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

// Same name, same color, so a person is recognizable across cards.
function colorOf(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return avatarColors[hash % avatarColors.length];
}

export function UserAvatar({
  name,
  size = "sm",
  className,
}: {
  name: string;
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <Avatar size={size} title={name} className={className}>
      <AvatarFallback className={cn("font-medium", colorOf(name))}>
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}

function UnassignedAvatar() {
  return (
    <span
      title="Sem responsável"
      aria-label="Sem responsável"
      className="flex size-6 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-muted-foreground"
    >
      <User className="size-3.5" />
    </span>
  );
}

// The responsible-person avatar as a button that opens a quick picker, for
// the Trello-style quick edits on a task card. Only managers reassign (same
// rule as the full task dialog); everyone else just sees who owns it.
function AssigneePicker({
  assigneeId,
  assigneeName,
  assignees,
  teamIds,
  canAssign,
  onPick,
}: {
  assigneeId: string | null;
  assigneeName: string | null;
  assignees: Array<{ id: string; name: string }>;
  teamIds: string[];
  canAssign: boolean;
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!canAssign) {
    return assigneeName ? (
      <UserAvatar name={assigneeName} />
    ) : (
      <UnassignedAvatar />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Alterar responsável"
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => event.stopPropagation()}
        >
          {assigneeName ? (
            <UserAvatar name={assigneeName} />
          ) : (
            <UnassignedAvatar />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-1"
        onClick={(event) => event.stopPropagation()}
      >
        <AssigneeButtons
          assignees={assignees}
          teamIds={teamIds}
          value={assigneeId ?? NO_ASSIGNEE}
          onSelect={(value) => {
            setOpen(false);
            const id = value === NO_ASSIGNEE ? null : value;
            if (id !== assigneeId) onPick(id);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

type DropHandlers = {
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
};

export function BoardColumn({
  title,
  count,
  dotClassName,
  isDropTarget,
  drop,
  onAdd,
  addLabel = "Criar tarefa",
  dropAtEnd = false,
  children,
}: {
  title: string;
  count: number;
  dotClassName: string;
  isDropTarget: boolean;
  drop?: DropHandlers;
  onAdd?: () => void;
  addLabel?: string;
  // Shows where a dragged card will land when dropped after the last one.
  dropAtEnd?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex w-[280px] shrink-0 flex-col rounded-xl bg-muted/70 lg:min-w-[260px] lg:flex-1"
    >
      <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h3 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn("size-2 shrink-0 rounded-full", dotClassName)}
          />
          <span className="truncate">{title}</span>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground/70">
            {count}
          </span>
        </h3>
        {onAdd ? (
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onAdd}
            aria-label={`${addLabel} em ${title}`}
          >
            <Plus />
          </Button>
        ) : null}
      </header>
      <div
        {...drop}
        className={cn(
          "mx-2 flex min-h-28 flex-1 flex-col gap-2 rounded-lg p-1 transition-colors",
          isDropTarget && "bg-primary/10 ring-2 ring-inset ring-primary/40",
        )}
      >
        {children}
        {dropAtEnd && count > 0 ? <DropLine /> : null}
        {count === 0 ? (
          <p className="select-none px-2 py-6 text-center text-xs text-muted-foreground/70">
            {drop ? "Arraste um item para cá" : "Nenhum item"}
          </p>
        ) : null}
      </div>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="mx-2 mb-2 mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground"
        >
          <Plus className="size-4" />
          {addLabel}
        </button>
      ) : (
        <div className="h-2" />
      )}
    </section>
  );
}

// Marks the place a dragged card will take.
export function DropLine() {
  return (
    <div
      aria-hidden="true"
      className="-my-1 h-1 shrink-0 rounded-full bg-primary"
    />
  );
}

type CardDragProps = {
  draggable: boolean;
  dragging: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
};

const cardClassName =
  "group rounded-lg border border-border/70 bg-card p-3 text-sm text-card-foreground shadow-xs transition-all hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectCard({
  id,
  code,
  title,
  priority,
  requesterName,
  requesterDepartment,
  taskDone,
  taskTotal,
  dueDate,
  closed,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
}: CardDragProps & {
  id: string;
  code: number;
  title: string;
  priority: ProjectPriority;
  requesterName: string;
  requesterDepartment: string;
  taskDone: number;
  taskTotal: number;
  dueDate: Date | string | null;
  closed: boolean;
}) {
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        cardClassName,
        draggable && "cursor-grab active:cursor-grabbing",
        dragging && "rotate-1 opacity-40",
      )}
    >
      <p className="font-mono text-[11px] text-muted-foreground">
        {formatProjectCode(code)}
      </p>
      <Link
        href={`/solicitacoes/${id}`}
        draggable={false}
        className="line-clamp-3 font-medium leading-snug hover:text-primary hover:underline"
      >
        {title}
      </Link>
      {taskTotal > 0 ? (
        <TaskProgress className="mt-2" done={taskDone} total={taskTotal} />
      ) : null}
      <DueBadge dueDate={dueDate} closed={closed} className="mt-2" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            title="Solicitação"
            className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-blue-600 text-white"
          >
            <Briefcase className="size-2.5" />
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {requesterDepartment || requesterName}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <PriorityIcon priority={priority} />
          <UserAvatar name={requesterName} />
        </span>
      </div>
    </article>
  );
}

const VISIBLE_LABELS = 3;

// Etiquetas: read-only chips, or (when not disabled) a button that opens a
// popover with the same LabelsInput used in the forms.
function LabelsPicker({
  labels,
  onChange,
  disabled,
}: {
  labels: string[];
  onChange: (labels: string[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  const chips = labels.length ? (
    <ul className="flex flex-wrap gap-1" aria-label="Etiquetas">
      {labels.slice(0, VISIBLE_LABELS).map((label) => (
        <li
          key={label}
          className="max-w-full truncate rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground"
        >
          {label}
        </li>
      ))}
      {labels.length > VISIBLE_LABELS ? (
        <li
          title={labels.slice(VISIBLE_LABELS).join(", ")}
          className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          +{labels.length - VISIBLE_LABELS}
        </li>
      ) : null}
    </ul>
  ) : null;

  if (disabled) return chips;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Editar etiquetas"
          className="block w-full text-start"
          onClick={(event) => event.stopPropagation()}
        >
          {chips ?? (
            <span className="inline-flex rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground">
              + etiqueta
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64"
        onClick={(event) => event.stopPropagation()}
      >
        <LabelsInput value={labels} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

export function TaskCard({
  id,
  title,
  createdAt,
  assigneeId,
  assigneeName,
  priority,
  labels,
  commentCount,
  attachmentCount,
  projectTitle,
  dueDate,
  closed,
  draggable,
  dragging,
  dropBefore = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onOpen,
  editable = false,
  canAssign = false,
  assignees = [],
  teamIds = [],
  onChanged,
}: CardDragProps & {
  id: string;
  title: string;
  createdAt: string | Date;
  assigneeId: string | null;
  assigneeName: string | null;
  priority: ProjectPriority;
  labels: string[];
  commentCount: number;
  attachmentCount: number;
  dueDate: Date | string | null;
  closed: boolean;
  // A dragged card is about to be dropped in front of this one.
  dropBefore?: boolean;
  onDragOver?: (event: DragEvent) => void;
  // Shown when tasks from several projects share the board ("my tasks").
  projectTitle?: string;
  onOpen: () => void;
  // Trello-style quick edits directly on the card: click the title, the
  // priority icon, the labels or the avatar to change them right there,
  // without opening the full dialog. Off by default; the same rule as the
  // dialog decides who gets it (canMoveTask for editable, isManager for
  // canAssign).
  editable?: boolean;
  canAssign?: boolean;
  assignees?: Array<{ id: string; name: string }>;
  teamIds?: string[];
  // Called after a quick edit is saved, so the board reloads from the truth.
  onChanged?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  const save = (patch: Omit<Parameters<typeof updateTask>[0], "id">) =>
    startTransition(async () => {
      const result = await updateTask({ id, ...patch });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onChanged?.();
    });

  const startEditingTitle = () => {
    setTitleDraft(title);
    setEditingTitle(true);
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === title) {
      setTitleDraft(title);
      return;
    }
    save({ title: trimmed });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };

  return (
    <>
      {dropBefore ? <DropLine /> : null}
      <article
        role="button"
        tabIndex={0}
        draggable={draggable && !editingTitle}
        onClick={onOpen}
        onKeyDown={handleKeyDown}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        className={cn(
          cardClassName,
          "cursor-pointer",
          draggable && "active:cursor-grabbing",
          dragging && "rotate-1 opacity-40",
          isPending && "opacity-70",
        )}
      >
        {editable && editingTitle ? (
          <input
            ref={titleInputRef}
            autoFocus
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={commitTitle}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                commitTitle();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setTitleDraft(title);
                setEditingTitle(false);
              }
            }}
            className="-m-0.5 w-[calc(100%+0.25rem)] rounded border border-ring bg-background p-0.5 font-medium leading-snug text-card-foreground outline-none"
          />
        ) : (
          <p
            className={cn(
              "line-clamp-3 font-medium leading-snug",
              editable && "-m-0.5 rounded p-0.5 hover:bg-accent",
            )}
            onClick={
              editable
                ? (event) => {
                    event.stopPropagation();
                    startEditingTitle();
                  }
                : undefined
            }
          >
            {title}
          </p>
        )}
        {projectTitle ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {projectTitle}
          </p>
        ) : null}
        {editable || labels.length ? (
          <div className="mt-2">
            <LabelsPicker
              labels={labels}
              disabled={!editable}
              onChange={(next) => save({ labels: next })}
            />
          </div>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span
              title="Tarefa"
              className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-emerald-600 text-white"
            >
              <CheckSquare className="size-2.5" />
            </span>
            {dueDate ? (
              <DueBadge dueDate={dueDate} closed={closed} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {new Date(createdAt).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "short",
                })}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {commentCount > 0 ? (
              <span
                title={`${commentCount} comentário(s)`}
                className="flex items-center gap-0.5 text-xs text-muted-foreground"
              >
                <MessageSquare className="size-3.5" />
                {commentCount}
              </span>
            ) : null}
            {attachmentCount > 0 ? (
              <span
                title={`${attachmentCount} anexo(s)`}
                className="flex items-center gap-0.5 text-xs text-muted-foreground"
              >
                <Paperclip className="size-3.5" />
                {attachmentCount}
              </span>
            ) : null}
            <PriorityPicker
              priority={priority}
              disabled={!editable}
              onPick={(value) => save({ priority: value })}
            />
            <AssigneePicker
              assigneeId={assigneeId}
              assigneeName={assigneeName}
              assignees={assignees}
              teamIds={teamIds}
              canAssign={canAssign}
              onPick={(newId) => save({ assigneeId: newId })}
            />
          </span>
        </div>
      </article>
    </>
  );
}

export function CardSkeletons({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-lg border border-border/60 bg-card p-3"
        >
          <div className="h-3 w-4/5 rounded bg-muted" />
          <div className="mt-2 h-3 w-3/5 rounded bg-muted" />
          <div className="mt-4 flex items-center justify-between">
            <div className="size-4 rounded-[3px] bg-muted" />
            <div className="size-6 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </>
  );
}
