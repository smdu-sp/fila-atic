"use client";

import type { DragEvent, KeyboardEvent, ReactNode } from "react";
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

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DueBadge } from "@/components/due-badge";
import { TaskProgress } from "@/components/task-progress";
import { Button } from "@/components/ui/button";
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

export function TaskCard({
  title,
  createdAt,
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
}: CardDragProps & {
  title: string;
  createdAt: string | Date;
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
}) {
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
        draggable={draggable}
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
        )}
      >
        <p className="line-clamp-3 font-medium leading-snug">{title}</p>
        {projectTitle ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {projectTitle}
          </p>
        ) : null}
        {labels.length ? (
          <ul className="mt-2 flex flex-wrap gap-1" aria-label="Etiquetas">
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
            <PriorityIcon priority={priority} />
            {assigneeName ? (
              <UserAvatar name={assigneeName} />
            ) : (
              <UnassignedAvatar />
            )}
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
