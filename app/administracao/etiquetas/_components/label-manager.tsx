"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  createLabel,
  deleteLabel,
  updateLabel,
  type LabelItem,
} from "@/actions/labelActions";
import { LabelColorPicker } from "@/app/administracao/etiquetas/_components/label-color-picker";
import { LabelChip } from "@/components/label-catalog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_LABEL_COLOR } from "@/lib/labelColors";
import { MAX_LABEL_LENGTH } from "@/lib/taskFields";

function CreateLabelForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_LABEL_COLOR);

  const submit = () =>
    startTransition(async () => {
      const result = await createLabel({ name, color });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Etiqueta criada.");
      setName("");
      router.refresh();
    });

  return (
    <form
      className="grid min-w-0 gap-3 rounded-lg border bg-background p-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="text-sm font-medium">Nova etiqueta</p>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto] sm:items-center">
        <Input
          value={name}
          maxLength={MAX_LABEL_LENGTH}
          placeholder="Nome (ex.: Urgente)"
          aria-label="Nome da nova etiqueta"
          onChange={(event) => setName(event.target.value)}
        />
        <LabelColorPicker value={color} onChange={setColor} />
        <Button type="submit" disabled={isPending || !name.trim()}>
          Criar
        </Button>
      </div>
      {name.trim() ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          Prévia: <LabelChip name={name.trim()} color={color} />
        </div>
      ) : null}
    </form>
  );
}

function LabelRow({ label }: { label: LabelItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const dirty = name.trim() !== label.name || color !== label.color;

  const save = () =>
    startTransition(async () => {
      const result = await updateLabel({ id: label.id, name, color });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Etiqueta atualizada.");
      router.refresh();
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteLabel(label.id);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Etiqueta excluída.");
      router.refresh();
    });

  return (
    <li className="grid min-w-0 gap-3 rounded-lg border bg-background p-3 lg:grid-cols-[minmax(0,12rem)_minmax(0,14rem)_minmax(0,1fr)_auto] lg:items-center">
      <div className="flex min-w-0">
        <LabelChip name={name.trim() || label.name} color={color} />
      </div>
      <Input
        value={name}
        maxLength={MAX_LABEL_LENGTH}
        aria-label={`Nome da etiqueta ${label.name}`}
        onChange={(event) => setName(event.target.value)}
      />
      <LabelColorPicker
        value={color}
        onChange={setColor}
        label={`Cor da etiqueta ${label.name}`}
      />
      <div className="flex items-center justify-between gap-2 lg:justify-end">
        <span className="text-xs text-muted-foreground">
          {label.taskCount === 1 ? "1 tarefa" : `${label.taskCount} tarefas`}
        </span>
        <Button
          size="sm"
          disabled={isPending || !dirty || !name.trim()}
          onClick={save}
        >
          Salvar
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={isPending}>
              Excluir
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Excluir a etiqueta “{label.name}”?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {label.taskCount
                  ? `Ela será removida das ${label.taskCount} tarefa(s) que a usam. `
                  : ""}
                Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={remove}>Excluir</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

export function LabelManager({ labels }: { labels: LabelItem[] }) {
  return (
    <div className="grid min-w-0 gap-4">
      <CreateLabelForm />
      {labels.length ? (
        <ul className="grid min-w-0 gap-2">
          {labels.map((label) => (
            // remount when the server data changes, so the drafts start over
            <LabelRow
              key={`${label.id}:${label.name}:${label.color}`}
              label={label}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhuma etiqueta cadastrada ainda.
        </p>
      )}
    </div>
  );
}
