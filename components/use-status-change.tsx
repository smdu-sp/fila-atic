"use client";

import { useState } from "react";
import { ProjectStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  OpenTasksDialog,
  type DialogAction,
} from "@/components/open-tasks-dialog";
import type { OpenTask, StatusChangeOptions } from "@/lib/projectStatus";

type Runner = (
  options: StatusChangeOptions,
) => Promise<
  | { success: true }
  | { success: false; error: string; openTasks?: OpenTask[] }
>;

type Pending<C> = {
  status: ProjectStatus;
  runner: Runner;
  openTasks: OpenTask[];
  context: C;
};

// Finishing or cancelling a project that still has open tasks needs a
// decision. The server refuses first and returns the open tasks; this hook
// turns that refusal into a dialog and repeats the call with the choice.
// `context` is handed back to onSuccess, so callers that juggle several
// projects know which one was changed once the dialog is answered.
export function useStatusChangeGuard<C = undefined>(
  onSuccess?: (status: ProjectStatus, context: C) => void,
) {
  const [pending, setPending] = useState<Pending<C> | null>(null);
  const [busy, setBusy] = useState(false);

  // Resolves to true when the status was changed right away.
  async function request(status: ProjectStatus, runner: Runner, context?: C) {
    const result = await runner({});

    if (result.success) {
      onSuccess?.(status, context as C);
      return true;
    }

    if (result.openTasks?.length) {
      setPending({
        status,
        runner,
        openTasks: result.openTasks,
        context: context as C,
      });
      return false;
    }

    toast.error(result.error);
    return false;
  }

  async function choose(options: StatusChangeOptions) {
    if (!pending) return;

    setBusy(true);
    const result = await pending.runner(options);
    setBusy(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    const { status, context } = pending;
    setPending(null);
    onSuccess?.(status, context);
  }

  const cancelling = pending?.status === ProjectStatus.CANCELED;
  const count = pending?.openTasks.length ?? 0;
  const actions: DialogAction[] = cancelling
    ? [
        {
          label: "Cancelar projeto e tarefas",
          variant: "destructive",
          onClick: () => choose({ closeOpenTasks: true }),
        },
        {
          label: "Cancelar e manter tarefas",
          variant: "outline",
          onClick: () => choose({ confirmOpenTasks: true }),
        },
      ]
    : [
        {
          label: "Finalizar mesmo assim",
          onClick: () => choose({ confirmOpenTasks: true }),
        },
      ];

  const dialog = (
    <OpenTasksDialog
      open={pending !== null}
      title={
        cancelling
          ? "Cancelar projeto com tarefas em aberto?"
          : "Finalizar projeto com tarefas em aberto?"
      }
      description={
        count === 1
          ? "Ainda há 1 tarefa em aberto neste projeto."
          : `Ainda há ${count} tarefas em aberto neste projeto.`
      }
      openTasks={pending?.openTasks ?? []}
      actions={actions}
      busy={busy}
      onClose={() => setPending(null)}
    />
  );

  return { request, dialog };
}
