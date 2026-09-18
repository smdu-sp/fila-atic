"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { ProjectPriority, ProjectStatus, TaskStatus } from "@prisma/client";
import { Pencil, Plus } from "lucide-react";

import { listTasksByProject, updateTask } from "@/actions/taskActions";
import { updateTaskStatusLabels } from "@/actions/taskStatusActions";
import { CreateTaskForm } from "@/app/kanban/_components/create-task-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  getPriorityLabel,
  getStatusLabel,
  getTaskStatusLabel,
} from "@/lib/projectLabels";
import Link from "next/link";

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
  createdAt: string | Date;
};

type KanbanViewProps = {
  projects: ProjectItem[];
  taskStatusLabels: Record<TaskStatus, string>;
  canEditStatusLabels: boolean;
};

const projectStatusOrder: { status: ProjectStatus; label: string }[] = [
  {
    status: ProjectStatus.IN_ANALYSIS,
    label: getStatusLabel(ProjectStatus.IN_ANALYSIS),
  },
  {
    status: ProjectStatus.IN_DEVELOPMENT,
    label: getStatusLabel(ProjectStatus.IN_DEVELOPMENT),
  },
  {
    status: ProjectStatus.IN_TESTING,
    label: getStatusLabel(ProjectStatus.IN_TESTING),
  },
  {
    status: ProjectStatus.FINISHED,
    label: getStatusLabel(ProjectStatus.FINISHED),
  },
];

const taskStatusOrder: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.TESTING,
  TaskStatus.WAITING,
  TaskStatus.PAUSED,
  TaskStatus.DONE,
  TaskStatus.DEPLOYED,
];

export function KanbanView({
  projects,
  taskStatusLabels,
  canEditStatusLabels,
}: KanbanViewProps) {
  const [activeTab, setActiveTab] = useState<"projects" | "tasks">("projects");
  const [selectedProjectId, setSelectedProjectId] = useState(
    projects[0]?.id ?? "",
  );
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus | undefined>();
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>(TaskStatus.TODO);
  const [statusEditOpen, setStatusEditOpen] = useState(false);
  const [statusDraft, setStatusDraft] =
    useState<Record<TaskStatus, string>>(taskStatusLabels);
  const [statusLabelsState, setStatusLabelsState] = useState(taskStatusLabels);

  const columns = useMemo(
    () =>
      projectStatusOrder.map((column) => ({
        ...column,
        items: projects.filter((project) => project.status === column.status),
      })),
    [projects],
  );

  const taskColumns = useMemo(
    () =>
      taskStatusOrder.map((status) => ({
        status,
        label: statusLabelsState[status] ?? getTaskStatusLabel(status),
        items: tasks.filter((task) => task.status === status),
      })),
    [tasks, statusLabelsState],
  );

  const loadTasks = (projectId: string) => {
    if (!projectId) return;
    startTransition(async () => {
      setTaskError(null);
      const result = await listTasksByProject(projectId);
      if (!result.success) {
        setTasks([]);
        setTaskError(result.error);
        return;
      }
      setTasks(result.data);
    });
  };

  useEffect(() => {
    if (activeTab === "tasks" && selectedProjectId) {
      loadTasks(selectedProjectId);
    }
  }, [activeTab, selectedProjectId]);

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
    if (selectedProjectId) {
      loadTasks(selectedProjectId);
    }
  };

  const handleDragStart = (taskId: string) => (event: DragEvent) => {
    event.dataTransfer.setData("text/plain", taskId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDropStatus(null);
  };

  const handleDrop = (status: TaskStatus) => (event: DragEvent) => {
    event.preventDefault();
    const taskId = event.dataTransfer.getData("text/plain");
    setDropStatus(null);
    if (!taskId) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;

    startTransition(async () => {
      const result = await updateTask({ id: taskId, status });
      if (!result.success) {
        setTaskError(result.error);
        return;
      }
      if (selectedProjectId) {
        loadTasks(selectedProjectId);
      }
    });
  };

  const handleDragOver = (status: TaskStatus) => (event: DragEvent) => {
    event.preventDefault();
    if (dropStatus !== status) {
      setDropStatus(status);
    }
  };

  const handleDragLeave = (status: TaskStatus) => () => {
    if (dropStatus === status) {
      setDropStatus(null);
    }
  };

  const handleOpenEdit = (task: TaskItem) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditStatus(task.status);
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
      });
      if (!result.success) {
        setTaskError(result.error);
        return;
      }
      setEditOpen(false);
      if (selectedProjectId) {
        loadTasks(selectedProjectId);
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
        setTaskError(result.error);
        return;
      }
      setStatusLabelsState(statusDraft);
      setStatusEditOpen(false);
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background p-1">
          <Button
            size="sm"
            variant={activeTab === "projects" ? "default" : "ghost"}
            onClick={() => setActiveTab("projects")}
          >
            Projetos
          </Button>
          <Button
            size="sm"
            variant={activeTab === "tasks" ? "default" : "ghost"}
            onClick={() => setActiveTab("tasks")}
          >
            Tarefas
          </Button>
        </div>

        {activeTab === "tasks" ? (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={selectedProjectId}
              onValueChange={(value) => setSelectedProjectId(value)}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
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
                Editar status
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
        <div className="grid gap-4 lg:grid-cols-4">
          {columns.map((column) => (
            <Card key={column.status} className="bg-background">
              <CardHeader>
                <CardTitle className="text-sm font-semibold">
                  {column.label}
                </CardTitle>
                <CardDescription>{column.items.length} itens</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {column.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border/60 bg-muted/40 p-3"
                  >
                    <Link
                      href={`/solicitacoes/${item.id}`}
                      className="text-sm font-semibold text-foreground hover:underline"
                    >
                      {item.title}
                    </Link>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {item.requesterName} · {item.requesterDepartment}
                      </span>
                      <Badge variant="outline">
                        {getPriorityLabel(item.priority)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {!selectedProjectId ? (
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>Selecione um projeto</CardTitle>
                <CardDescription>
                  Escolha um projeto para visualizar as tarefas.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : null}
          {selectedProjectId
            ? taskColumns.map((column) => (
                <Card key={column.status} className="bg-background">
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {column.label}
                      </CardTitle>
                      <CardDescription>
                        {column.items.length} itens
                      </CardDescription>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => handleOpenCreate(column.status)}
                      disabled={!selectedProjectId}
                    >
                      <Plus />
                    </Button>
                  </CardHeader>
                  <CardContent
                    className={`space-y-3 transition-colors ${
                      dropStatus === column.status
                        ? "bg-muted/30"
                        : "bg-transparent"
                    }`}
                    onDragOver={handleDragOver(column.status)}
                    onDrop={handleDrop(column.status)}
                    onDragLeave={handleDragLeave(column.status)}
                  >
                    {column.items.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-lg border border-border/60 bg-muted/40 p-3 transition-shadow ${
                          draggingTaskId === item.id
                            ? "opacity-60 shadow-lg"
                            : ""
                        }`}
                        draggable
                        onDragStart={handleDragStart(item.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleOpenEdit(item)}
                      >
                        <p className="text-sm font-semibold text-foreground">
                          {item.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    ))}
                    {!column.items.length ? (
                      <button
                        type="button"
                        className="w-full rounded-lg border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground hover:bg-muted/40"
                        onClick={() => handleOpenCreate(column.status)}
                        disabled={!selectedProjectId}
                      >
                        + Adicionar tarefa
                      </button>
                    ) : null}
                  </CardContent>
                </Card>
              ))
            : null}
          {taskError ? (
            <Card className="lg:col-span-4">
              <CardContent className="pt-6 text-sm text-destructive">
                {taskError}
              </CardContent>
            </Card>
          ) : null}
        </div>
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
            projects={projects.map((project) => ({
              id: project.id,
              title: project.title,
            }))}
            initialProjectId={selectedProjectId}
            initialStatus={createStatus}
            hideProjectSelect={Boolean(selectedProjectId)}
            onCreated={handleCreated}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar tarefa</DialogTitle>
            <DialogDescription>
              Atualize titulo, descricao e status da tarefa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Input
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              placeholder="Titulo da tarefa"
            />
            <Textarea
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              placeholder="Descricao"
            />
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
            <DialogTitle>Editar status das tarefas</DialogTitle>
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

      {isPending ? (
        <p className="text-xs text-muted-foreground">Atualizando tarefas...</p>
      ) : null}
    </div>
  );
}
