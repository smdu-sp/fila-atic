"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { ProjectPriority, ProjectStatus, Role, TaskStatus } from "@prisma/client";
import { Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { updateProject } from "@/actions/projectActions";
import { updateProjectStatusRestricted } from "@/actions/solicitacaoActions";
import { listTasksByProject, updateTask } from "@/actions/taskActions";
import { updateTaskStatusLabels } from "@/actions/taskStatusActions";
import {
  BoardColumn,
  CardSkeletons,
  ProjectCard,
  TaskCard,
  UserAvatar,
} from "@/app/kanban/_components/board-ui";
import { CreateTaskForm } from "@/app/kanban/_components/create-task-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Textarea } from "@/components/ui/textarea";
import { getStatusLabel, getTaskStatusLabel } from "@/lib/projectLabels";
import { cn } from "@/lib/utils";

type ProjectItem = {
  id: string;
  title: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  requesterName: string;
  requesterDepartment: string;
};

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string | Date;
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
};

const projectColumns: { status: ProjectStatus; dot: string }[] = [
  { status: ProjectStatus.IN_ANALYSIS, dot: "bg-amber-500" },
  { status: ProjectStatus.IN_DEVELOPMENT, dot: "bg-sky-500" },
  { status: ProjectStatus.IN_TESTING, dot: "bg-violet-500" },
  { status: ProjectStatus.FINISHED, dot: "bg-emerald-500" },
];

const taskColumns: { status: TaskStatus; dot: string }[] = [
  { status: TaskStatus.TODO, dot: "bg-slate-400" },
  { status: TaskStatus.IN_PROGRESS, dot: "bg-sky-500" },
  { status: TaskStatus.TESTING, dot: "bg-violet-500" },
  { status: TaskStatus.WAITING, dot: "bg-amber-500" },
  { status: TaskStatus.PAUSED, dot: "bg-orange-500" },
  { status: TaskStatus.DONE, dot: "bg-emerald-500" },
  { status: TaskStatus.DEPLOYED, dot: "bg-teal-500" },
];

const taskStatusOrder = taskColumns.map((column) => column.status);

const NO_ASSIGNEE = "none";

export function KanbanView({
  projects,
  taskStatusLabels,
  canEditStatusLabels,
  role,
  currentUserId,
  assignees,
}: KanbanViewProps) {
  const [activeTab, setActiveTab] = useState<"projects" | "tasks">("projects");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [projectItems, setProjectItems] = useState(projects);
  const [selectedProjectId, setSelectedProjectId] = useState(
    projects[0]?.id ?? "",
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
  const [editOpen, setEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>(TaskStatus.TODO);
  const [editAssignee, setEditAssignee] = useState(NO_ASSIGNEE);
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

  const isManager = role === Role.COORDINATOR || role === Role.DEV_GLOBAL;
  const canAssign = assignees.length > 0;
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
        label: statusLabelsState[column.status] ?? getTaskStatusLabel(column.status),
        items: tasks.filter(
          (task) =>
            task.status === column.status &&
            (!assigneeFilter || task.assigneeId === assigneeFilter) &&
            (!query ||
              task.title.toLowerCase().includes(query) ||
              (task.description ?? "").toLowerCase().includes(query)),
        ),
      })),
    [tasks, statusLabelsState, assigneeFilter, query],
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

  const editAssigneeOptions = useMemo(() => {
    const options = [...assignees];
    if (
      editingTask?.assigneeId &&
      editingTask.assigneeName &&
      !options.some((option) => option.id === editingTask.assigneeId)
    ) {
      options.push({
        id: editingTask.assigneeId,
        name: editingTask.assigneeName,
      });
    }
    return options;
  }, [assignees, editingTask]);

  useEffect(() => {
    setProjectItems(projects);
  }, [projects]);

  useEffect(() => {
    if (activeTab !== "tasks" || !selectedProjectId) return;

    let cancelled = false;
    setTaskError(null);

    listTasksByProject(selectedProjectId).then((result) => {
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
  }, [activeTab, selectedProjectId, reloadKey]);

  useEffect(() => {
    setAssigneeFilter(null);
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
  };

  const dropHandlers = (status: string, onDropItem: (id: string) => void) => ({
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dropStatus !== status) setDropStatus(status);
    },
    onDragLeave: () => {
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
  const moveTask = (taskId: string, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;

    setTasks((prev) =>
      prev.map((item) => (item.id === taskId ? { ...item, status } : item)),
    );

    startTransition(async () => {
      const result = await updateTask({ id: taskId, status });
      if (!result.success) {
        toast.error(result.error);
        reloadTasks();
      }
    });
  };

  const moveProject = (projectId: string, status: ProjectStatus) => {
    const project = projectItems.find((item) => item.id === projectId);
    if (!project || project.status === status || !canMoveProjects) return;

    const previous = projectItems;
    setProjectItems((prev) =>
      prev.map((item) => (item.id === projectId ? { ...item, status } : item)),
    );

    startTransition(async () => {
      const result =
        role === Role.DEV_RESTRICTED
          ? await updateProjectStatusRestricted(projectId, status)
          : await updateProject({ id: projectId, status });

      if (!result.success) {
        toast.error(result.error);
        setProjectItems(previous);
      }
    });
  };

  const handleOpenEdit = (task: TaskItem) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditStatus(task.status);
    setEditAssignee(task.assigneeId ?? NO_ASSIGNEE);
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingTask) return;
    const title = editTitle.trim();
    if (!title) return;

    startTransition(async () => {
      const result = await updateTask({
        id: editingTask.id,
        title,
        description: editDescription.trim() || null,
        status: editStatus,
        assigneeId: canAssign
          ? editAssignee === NO_ASSIGNEE
            ? null
            : editAssignee
          : undefined,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEditOpen(false);
      reloadTasks();
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

          {activeTab === "tasks" && taskOwners.length ? (
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
            <Select
              value={selectedProjectId}
              onValueChange={(value) => setSelectedProjectId(value)}
            >
              <SelectTrigger className="w-60 bg-background">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
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
              disabled={!selectedProjectId}
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
          <div className="flex items-stretch gap-3 overflow-x-auto pb-3">
            {taskBoard.map((column) => (
              <BoardColumn
                key={column.status}
                title={column.label}
                count={column.items.length}
                dotClassName={column.dot}
                isDropTarget={dropStatus === column.status}
                drop={dropHandlers(column.status, (id) =>
                  moveTask(id, column.status),
                )}
                onAdd={() => handleOpenCreate(column.status)}
              >
                {loadingTasks ? (
                  <CardSkeletons />
                ) : (
                  column.items.map((item) => (
                    <TaskCard
                      key={item.id}
                      title={item.title}
                      createdAt={item.createdAt}
                      assigneeName={item.assigneeName}
                      draggable={canMoveTask(item)}
                      dragging={draggingId === item.id}
                      onDragStart={handleDragStart(item.id)}
                      onDragEnd={handleDragEnd}
                      onOpen={() => handleOpenEdit(item)}
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
            assignees={assignees}
            onCreated={handleCreated}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar tarefa</DialogTitle>
            <DialogDescription>
              Atualize título, descrição, status e responsável da tarefa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="edit-title">Título</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder="Título da tarefa"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                placeholder="Descrição"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={editStatus}
                onValueChange={(value) => setEditStatus(value as TaskStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {taskStatusOrder.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabelsState[status] ?? getTaskStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {canAssign ? (
              <div className="grid gap-1.5">
                <Label>Responsável</Label>
                <Select value={editAssignee} onValueChange={setEditAssignee}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sem responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ASSIGNEE}>Sem responsável</SelectItem>
                    {editAssigneeOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveEdit} disabled={isPending}>
                {isPending ? "Salvando" : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={statusEditOpen} onOpenChange={setStatusEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar colunas das tarefas</DialogTitle>
            <DialogDescription>
              Personalize os nomes usados no Kanban de tarefas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {taskStatusOrder.map((status) => (
              <div key={status} className="grid gap-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {getTaskStatusLabel(status)}
                </span>
                <Input
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
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setStatusEditOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveStatusLabels} disabled={isPending}>
                {isPending ? "Salvando" : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
