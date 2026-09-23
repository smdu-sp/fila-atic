"use client";

import { isCoordination } from "@/lib/roles";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import {
  ProjectPriority,
  ProjectStatus,
  Role,
  TaskStatus,
} from "@prisma/client";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { updateProject } from "@/actions/projectActions";
import { updateProjectStatusRestricted } from "@/actions/solicitacaoActions";
import {
  listMyTasks,
  listTasksByProject,
  moveTask as moveTaskOnServer,
} from "@/actions/taskActions";
import { updateTaskStatusLabels } from "@/actions/taskStatusActions";
import {
  BoardColumn,
  CardSkeletons,
  ProjectCard,
  TaskCard,
  UserAvatar,
} from "@/app/kanban/_components/board-ui";
import { CreateTaskForm } from "@/app/kanban/_components/create-task-form";
import { TaskDialog } from "@/app/kanban/_components/task-dialog";
import {
  compareTasks,
  TASK_STATUS_ORDER,
  type TaskItem,
} from "@/app/kanban/_components/task-types";
import { TaskProgress } from "@/components/task-progress";
import { useStatusChangeGuard } from "@/components/use-status-change";
import { isTaskOpen, summarizeTasks } from "@/lib/taskStatus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPriorityLabel,
  getStatusLabel,
  getTaskStatusLabel,
} from "@/lib/projectLabels";
import { cn } from "@/lib/utils";

type ProjectItem = {
  id: string;
  title: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  requesterName: string;
  requesterDepartment: string;
  taskTotal: number;
  taskDone: number;
  developerIds: string[];
  dueDate: Date | null;
};

type Assignee = { id: string; name: string };

type KanbanViewProps = {
  projects: ProjectItem[];
  taskStatusLabels: Record<TaskStatus, string>;
  canEditStatusLabels: boolean;
  role: Role;
  currentUserId: string;
  // Developers that can be picked as task owner (empty when the role cannot
  // assign tasks).
  assignees: Assignee[];
  initialProjectId?: string;
  initialTab?: "projects" | "tasks";
};

const projectColumns: { status: ProjectStatus; dot: string }[] = [
  { status: ProjectStatus.IN_ANALYSIS, dot: "bg-amber-500" },
  { status: ProjectStatus.IN_DEVELOPMENT, dot: "bg-sky-500" },
  { status: ProjectStatus.IN_TESTING, dot: "bg-violet-500" },
  { status: ProjectStatus.FINISHED, dot: "bg-emerald-500" },
];

const taskColumnDots: Record<TaskStatus, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-sky-500",
  TESTING: "bg-violet-500",
  WAITING: "bg-amber-500",
  PAUSED: "bg-orange-500",
  DONE: "bg-emerald-500",
  DEPLOYED: "bg-teal-500",
  CANCELED: "bg-rose-400",
};

const taskStatusOrder = TASK_STATUS_ORDER;
const taskColumns = taskStatusOrder.map((status) => ({
  status,
  dot: taskColumnDots[status],
}));

// Special value of the project picker: my tasks, from every project.
const MINE = "__mine__";
// Special value of the priority and label filters: no filter.
const ALL = "__all__";

export function KanbanView({
  projects,
  taskStatusLabels,
  canEditStatusLabels,
  role,
  currentUserId,
  assignees,
  initialProjectId,
  initialTab = "projects",
}: KanbanViewProps) {
  const [activeTab, setActiveTab] = useState<"projects" | "tasks">(initialTab);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [projectItems, setProjectItems] = useState(projects);
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId && projects.some((p) => p.id === initialProjectId)
      ? initialProjectId
      : (projects[0]?.id ?? ""),
  );
  // Tasks are tagged with the project they were loaded for, so an answer for
  // a project that is no longer selected is simply ignored.
  const [taskData, setTaskData] = useState<{
    projectId: string;
    items: TaskItem[];
  }>({ projectId: "", items: [] });
  const [reloadKey, setReloadKey] = useState(0);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus | undefined>();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  // Card the dragged one will be placed in front of; null means "at the end".
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string>(ALL);
  const [labelFilter, setLabelFilter] = useState<string>(ALL);
  const [statusEditOpen, setStatusEditOpen] = useState(false);
  const [statusDraft, setStatusDraft] =
    useState<Record<TaskStatus, string>>(taskStatusLabels);
  const [statusLabelsState, setStatusLabelsState] = useState(taskStatusLabels);

  const tasks = useMemo(
    () => (taskData.projectId === selectedProjectId ? taskData.items : []),
    [taskData, selectedProjectId],
  );
  const loadingTasks =
    Boolean(selectedProjectId) &&
    taskData.projectId !== selectedProjectId &&
    !taskError;
  const setTasks = (update: (items: TaskItem[]) => TaskItem[]) =>
    setTaskData((prev) => ({ ...prev, items: update(prev.items) }));
  const reloadTasks = () => setReloadKey((key) => key + 1);

  const statusGuard = useStatusChangeGuard<string>((status, projectId) =>
    setProjectItems((prev) =>
      prev.map((item) => (item.id === projectId ? { ...item, status } : item)),
    ),
  );
  const isMine = selectedProjectId === MINE;
  const taskSummary = useMemo(
    () => summarizeTasks(tasks.map((task) => task.status)),
    [tasks],
  );
  const teamIdsOf = (projectId: string | undefined) =>
    projectItems.find((project) => project.id === projectId)?.developerIds ??
    [];
  const isManager = isCoordination(role) || role === Role.DEV_GLOBAL;
  const canMoveProjects = role !== Role.REQUESTER;
  const canMoveTask = (task: TaskItem) =>
    isManager || task.assigneeId === currentUserId;

  const query = search.trim().toLowerCase();

  const projectBoard = useMemo(
    () =>
      projectColumns.map((column) => ({
        ...column,
        label: getStatusLabel(column.status),
        items: projectItems.filter(
          (project) =>
            project.status === column.status &&
            (!query ||
              project.title.toLowerCase().includes(query) ||
              project.requesterName.toLowerCase().includes(query) ||
              project.requesterDepartment.toLowerCase().includes(query)),
        ),
      })),
    [projectItems, query],
  );

  const taskBoard = useMemo(
    () =>
      taskColumns.map((column) => ({
        ...column,
        label:
          statusLabelsState[column.status] ?? getTaskStatusLabel(column.status),
        items: tasks
          .filter(
            (task) =>
              task.status === column.status &&
              (!assigneeFilter || task.assigneeId === assigneeFilter) &&
              (priorityFilter === ALL || task.priority === priorityFilter) &&
              (labelFilter === ALL || task.labels.includes(labelFilter)) &&
              (!query ||
                task.title.toLowerCase().includes(query) ||
                (task.description ?? "").toLowerCase().includes(query)),
          )
          .sort(compareTasks),
      })),
    [
      tasks,
      statusLabelsState,
      assigneeFilter,
      priorityFilter,
      labelFilter,
      query,
    ],
  );

  // People already working in this project's tasks, for the quick filter.
  const taskOwners = useMemo(() => {
    const owners = new Map<string, string>();
    tasks.forEach((task) => {
      if (task.assigneeId && task.assigneeName) {
        owners.set(task.assigneeId, task.assigneeName);
      }
    });
    return Array.from(owners, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [tasks]);

  const taskLabelOptions = useMemo(
    () =>
      Array.from(new Set(tasks.flatMap((task) => task.labels))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [tasks],
  );

  const editingTask = tasks.find((task) => task.id === editingId) ?? null;

  useEffect(() => {
    setProjectItems(projects);
  }, [projects]);

  useEffect(() => {
    if (activeTab !== "tasks" || !selectedProjectId) return;

    let cancelled = false;
    setTaskError(null);

    const load = isMine ? listMyTasks() : listTasksByProject(selectedProjectId);
    load.then((result) => {
      if (cancelled) return;
      if (!result.success) {
        setTaskData({ projectId: selectedProjectId, items: [] });
        setTaskError(result.error);
        return;
      }
      setTaskData({ projectId: selectedProjectId, items: result.data });
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedProjectId, isMine, reloadKey]);

  useEffect(() => {
    setAssigneeFilter(null);
    setLabelFilter(ALL);
  }, [selectedProjectId]);

  useEffect(() => {
    setStatusLabelsState(taskStatusLabels);
    setStatusDraft(taskStatusLabels);
  }, [taskStatusLabels]);

  const handleOpenCreate = (status?: TaskStatus) => {
    if (!selectedProjectId) return;
    setCreateStatus(status);
    setTaskDialogOpen(true);
  };

  const handleCreated = () => {
    setTaskDialogOpen(false);
    reloadTasks();
  };

  const handleDragStart = (id: string) => (event: DragEvent) => {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDropStatus(null);
    setDropBeforeId(null);
  };

  const dropHandlers = (status: string, onDropItem: (id: string) => void) => ({
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dropStatus !== status) setDropStatus(status);
    },
    onDragLeave: (event: DragEvent) => {
      // moving over a card inside the column is not leaving it
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return;
      }
      if (dropStatus === status) setDropStatus(null);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const id = event.dataTransfer.getData("text/plain");
      setDropStatus(null);
      setDraggingId(null);
      if (id) onDropItem(id);
    },
  });

  // Cards move right away; the server is asked afterwards and the board is
  // reloaded from the truth if it refuses (e.g. missing permission).
  // beforeId: card to be placed in front of, null for the end of the column,
  // undefined to keep the position (only the column changes).
  const moveTask = (
    taskId: string,
    status: TaskStatus,
    beforeId?: string | null,
  ) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || beforeId === taskId) return;

    let position = task.position;

    if (beforeId === undefined) {
      if (task.status === status) return;
    } else {
      const column = tasks
        .filter((item) => item.status === status)
        .sort(compareTasks);
      const others = column.filter((item) => item.id !== taskId);
      const index =
        beforeId === null
          ? others.length
          : others.findIndex((item) => item.id === beforeId);
      if (index === -1) return;

      // dropped where it already is
      if (task.status === status) {
        const current = column.findIndex((item) => item.id === taskId);
        if ((column[current + 1]?.id ?? null) === beforeId) return;
      }

      const previous = others[index - 1];
      const next = others[index];
      position =
        previous && next
          ? (previous.position + next.position) / 2
          : next
            ? next.position - 1
            : previous
              ? previous.position + 1
              : 0;
    }

    setTasks((prev) =>
      prev.map((item) =>
        item.id === taskId ? { ...item, status, position } : item,
      ),
    );

    startTransition(async () => {
      const result = await moveTaskOnServer({
        taskId,
        status,
        beforeTaskId: beforeId,
      });
      if (!result.success) {
        toast.error(result.error);
        reloadTasks();
      }
    });
  };

  // Where a card dragged over another one would land: in front of it when the
  // pointer is in its upper half, otherwise in front of the next card.
  const cardDragOver =
    (status: TaskStatus, items: TaskItem[], index: number) =>
    (event: DragEvent) => {
      if (isMine) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";

      const rect = event.currentTarget.getBoundingClientRect();
      const upper = event.clientY < rect.top + rect.height / 2;
      const beforeId = upper ? items[index].id : (items[index + 1]?.id ?? null);

      if (dropStatus !== status) setDropStatus(status);
      if (dropBeforeId !== beforeId) setDropBeforeId(beforeId);
    };

  // Over the free space of a column (below the last card, or empty): the end.
  const columnDragOver = (status: TaskStatus) => (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropStatus !== status) setDropStatus(status);
    if (isMine) return;

    const cards = event.currentTarget.querySelectorAll("article");
    const last = cards[cards.length - 1];
    if (!last || event.clientY > last.getBoundingClientRect().bottom) {
      if (dropBeforeId !== null) setDropBeforeId(null);
    }
  };

  const dropTask = (status: TaskStatus) => (event: DragEvent) => {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const before = isMine ? undefined : dropBeforeId;
    handleDragEnd();
    if (id) moveTask(id, status, before);
  };

  const runProjectStatus = (
    projectId: string,
    status: ProjectStatus,
    options: { confirmOpenTasks?: boolean; closeOpenTasks?: boolean } = {},
  ) =>
    role === Role.DEV_RESTRICTED
      ? updateProjectStatusRestricted(projectId, status, options)
      : updateProject({ id: projectId, status, ...options });

  const moveProject = (projectId: string, status: ProjectStatus) => {
    const project = projectItems.find((item) => item.id === projectId);
    if (!project || project.status === status || !canMoveProjects) return;

    // Finishing with open tasks needs an answer first, so no optimistic move.
    if (
      status === ProjectStatus.FINISHED &&
      project.taskTotal > project.taskDone
    ) {
      startTransition(async () => {
        await statusGuard.request(
          status,
          (options) => runProjectStatus(projectId, status, options),
          projectId,
        );
      });
      return;
    }

    const previous = projectItems;
    setProjectItems((prev) =>
      prev.map((item) => (item.id === projectId ? { ...item, status } : item)),
    );

    startTransition(async () => {
      const result = await runProjectStatus(projectId, status);

      if (!result.success) {
        toast.error(result.error);
        setProjectItems(previous);
      }
    });
  };

  const handleOpenStatusEdit = () => {
    setStatusDraft(statusLabelsState);
    setStatusEditOpen(true);
  };

  const handleSaveStatusLabels = () => {
    startTransition(async () => {
      const result = await updateTaskStatusLabels(statusDraft);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setStatusLabelsState(statusDraft);
      setStatusEditOpen(false);
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            className="inline-flex rounded-lg bg-muted p-1 text-sm"
          >
            {(
              [
                ["projects", "Projetos"],
                ["tasks", "Tarefas"],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "rounded-md px-3 py-1 font-medium transition-colors",
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                activeTab === "projects"
                  ? "Buscar projeto ou solicitante"
                  : "Buscar tarefa"
              }
              aria-label="Buscar no quadro"
              className="w-56 bg-background pl-8 sm:w-64"
            />
          </div>

          {activeTab === "tasks" && !isMine && taskOwners.length ? (
            <div
              className="flex items-center -space-x-1.5"
              role="group"
              aria-label="Filtrar por responsável"
            >
              {taskOwners.map((owner) => (
                <button
                  key={owner.id}
                  type="button"
                  title={owner.name}
                  aria-pressed={assigneeFilter === owner.id}
                  onClick={() =>
                    setAssigneeFilter((current) =>
                      current === owner.id ? null : owner.id,
                    )
                  }
                  className={cn(
                    "rounded-full transition-transform hover:z-10 hover:-translate-y-0.5",
                    assigneeFilter === owner.id
                      ? "z-10 ring-2 ring-primary ring-offset-2 ring-offset-background"
                      : assigneeFilter
                        ? "opacity-50"
                        : "",
                  )}
                >
                  <UserAvatar name={owner.name} size="default" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {activeTab === "tasks" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger
                className="w-40 bg-background"
                aria-label="Filtrar por prioridade"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as prioridades</SelectItem>
                {Object.values(ProjectPriority).map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {getPriorityLabel(priority)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {taskLabelOptions.length ? (
              <Select value={labelFilter} onValueChange={setLabelFilter}>
                <SelectTrigger
                  className="w-40 bg-background"
                  aria-label="Filtrar por etiqueta"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as etiquetas</SelectItem>
                  {taskLabelOptions.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={selectedProjectId}
              onValueChange={(value) => setSelectedProjectId(value)}
            >
              <SelectTrigger className="w-60 bg-background">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MINE}>
                  Minhas tarefas (todos os projetos)
                </SelectItem>
                {projectItems.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canEditStatusLabels ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenStatusEdit}
              >
                <Pencil />
                Editar colunas
              </Button>
            ) : null}
            <Button
              size="sm"
              onClick={() => handleOpenCreate()}
              disabled={!selectedProjectId || isMine}
            >
              <Plus />
              Nova tarefa
            </Button>
          </div>
        ) : null}
      </div>

      {activeTab === "projects" ? (
        <div className="flex items-stretch gap-3 overflow-x-auto pb-3">
          {projectBoard.map((column) => (
            <BoardColumn
              key={column.status}
              title={column.label}
              count={column.items.length}
              dotClassName={column.dot}
              isDropTarget={dropStatus === column.status}
              drop={
                canMoveProjects
                  ? dropHandlers(column.status, (id) =>
                      moveProject(id, column.status),
                    )
                  : undefined
              }
            >
              {column.items.map((item) => (
                <ProjectCard
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  priority={item.priority}
                  requesterName={item.requesterName}
                  requesterDepartment={item.requesterDepartment}
                  taskDone={item.taskDone}
                  taskTotal={item.taskTotal}
                  dueDate={item.dueDate}
                  closed={item.status === ProjectStatus.FINISHED}
                  draggable={canMoveProjects}
                  dragging={draggingId === item.id}
                  onDragStart={handleDragStart(item.id)}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </BoardColumn>
          ))}
        </div>
      ) : !selectedProjectId ? (
        <div className="rounded-xl bg-muted/70 p-8 text-center text-sm text-muted-foreground">
          Selecione um projeto para ver as tarefas.
        </div>
      ) : (
        <>
          {taskError ? (
            <p className="text-sm text-destructive" role="alert">
              {taskError}
            </p>
          ) : null}
          {!isMine && taskSummary.total > 0 ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>Progresso do projeto</span>
              <TaskProgress done={taskSummary.done} total={taskSummary.total} />
              <span className="text-xs">
                {taskSummary.percent}% concluído
                {taskSummary.canceled
                  ? ` · ${taskSummary.canceled} cancelada(s)`
                  : ""}
              </span>
            </div>
          ) : null}
          <div className="flex items-stretch gap-3 overflow-x-auto pb-3">
            {taskBoard.map((column) => (
              <BoardColumn
                key={column.status}
                title={column.label}
                count={column.items.length}
                dotClassName={column.dot}
                isDropTarget={dropStatus === column.status}
                dropAtEnd={
                  dropStatus === column.status &&
                  dropBeforeId === null &&
                  !isMine
                }
                drop={{
                  ...dropHandlers(column.status, () => {}),
                  onDragOver: columnDragOver(column.status),
                  onDrop: dropTask(column.status),
                }}
                onAdd={
                  isMine ? undefined : () => handleOpenCreate(column.status)
                }
              >
                {loadingTasks ? (
                  <CardSkeletons />
                ) : (
                  column.items.map((item, index) => (
                    <TaskCard
                      key={item.id}
                      id={item.id}
                      title={item.title}
                      createdAt={item.createdAt}
                      assigneeId={item.assigneeId}
                      assigneeName={item.assigneeName}
                      priority={item.priority}
                      labels={item.labels}
                      commentCount={item.commentCount}
                      attachmentCount={item.attachmentCount}
                      projectTitle={item.projectTitle}
                      dueDate={item.dueDate}
                      closed={!isTaskOpen(item.status)}
                      draggable={canMoveTask(item)}
                      dragging={draggingId === item.id}
                      dropBefore={
                        dropStatus === column.status &&
                        dropBeforeId === item.id &&
                        draggingId !== item.id
                      }
                      onDragStart={handleDragStart(item.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={cardDragOver(
                        column.status,
                        column.items,
                        index,
                      )}
                      onOpen={() => setEditingId(item.id)}
                      editable={canMoveTask(item)}
                      canAssign={isManager}
                      assignees={assignees}
                      teamIds={teamIdsOf(item.projectId ?? selectedProjectId)}
                      onChanged={reloadTasks}
                    />
                  ))
                )}
              </BoardColumn>
            ))}
          </div>
          {isManager ? null : (
            <p className="text-xs text-muted-foreground">
              Você pode mover apenas as tarefas atribuídas a você.
            </p>
          )}
        </>
      )}

      {statusGuard.dialog}

      <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova tarefa</DialogTitle>
            <DialogDescription>
              Registre uma nova tarefa para o projeto selecionado.
            </DialogDescription>
          </DialogHeader>
          <CreateTaskForm
            projects={projectItems.map((project) => ({
              id: project.id,
              title: project.title,
            }))}
            initialProjectId={selectedProjectId}
            initialStatus={createStatus}
            hideProjectSelect={Boolean(selectedProjectId)}
            statusLabels={statusLabelsState}
            isManager={isManager}
            assignees={assignees}
            teamIds={teamIdsOf(selectedProjectId)}
            onCreated={handleCreated}
          />
        </DialogContent>
      </Dialog>

      <TaskDialog
        task={editingTask}
        open={editingTask !== null}
        onOpenChange={(open) => {
          if (!open) setEditingId(null);
        }}
        statusOrder={taskStatusOrder}
        statusLabels={statusLabelsState}
        assignees={assignees}
        teamIds={teamIdsOf(editingTask?.projectId ?? selectedProjectId)}
        canEdit={editingTask ? canMoveTask(editingTask) : false}
        isManager={isManager}
        currentUserId={currentUserId}
        onChanged={reloadTasks}
      />

      <Dialog open={statusEditOpen} onOpenChange={setStatusEditOpen}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Editar colunas das tarefas</DialogTitle>
            <DialogDescription>
              Personalize os nomes usados no Kanban de tarefas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {taskStatusOrder.map((status) => (
              <div key={status} className="grid gap-1.5">
                <Label htmlFor={`status-label-${status}`}>
                  {getTaskStatusLabel(status)}
                </Label>
                <Input
                  id={`status-label-${status}`}
                  value={statusDraft[status] ?? ""}
                  onChange={(event) =>
                    setStatusDraft((prev) => ({
                      ...prev,
                      [status]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStatusEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveStatusLabels} disabled={isPending}>
              {isPending ? "Salvando" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
