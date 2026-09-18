"use client";

import { useState } from "react";
import { ProjectStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  OpenTasksDialog,
  type DialogAction,
} from "@/components/open-tasks-dialog";
import { ReasonDialog } from "@/components/reason-dialog";
import type { OpenTask, StatusChangeOptions } from "@/lib/projectStatus";

type Runner = (
  options: StatusChangeOptions,
) => Promise<
  | { success: true }
  | {
      success: false;
      error: string;
      openTasks?: OpenTask[];
      needsReason?: boolean;
    }
>;

type Pending<C> = {
  status: ProjectStatus;
  runner: Runner;
  // what the person already answered (e.g. the reason), sent again with the
  // next answer
  answered: StatusChangeOptions;
  step: "reason" | "tasks";
  openTasks: OpenTask[];
  context: C;
};

// Some status changes need a decision before they go through:
//  - cancelling needs a written reason (the requester reads it);
//  - finishing or cancelling with open tasks needs a choice about them.
// The server refuses first and says what is missing; this hook turns that
// refusal into the right dialog and repeats the call with the answers.
// `context` is handed back to onSuccess, so callers that juggle several
// projects know which one was changed once the dialog is answered.
export function useStatusChangeGuard<C = undefined>(
  onSuccess?: (status: ProjectStatus, context: C) => void,
) {
  const [pending, setPending] = useState<Pending<C> | null>(null);
  const [busy, setBusy] = useState(false);

  // Shared by the first call and every answer: run, then decide what is next.
  async function attempt(
    status: ProjectStatus,
    runner: Runner,
    answered: StatusChangeOptions,
    context: C,
  ) {
    const result = await runner(answered);

    if (result.success) {
      setPending(null);
      onSuccess?.(status, context);
      return true;
    }

    if (result.needsReason) {
      setPending({ status, runner, answered, step: "reason", openTasks: [], context });
      return false;
    }

    if (result.openTasks?.length) {
      setPending({
        status,
        runner,
        answered,
        step: "tasks",
        openTasks: result.openTasks,
        context,
      });
      return false;
    }

    toast.error(result.error);
    return false;
  }

  // Resolves to true when the status was changed right away.
  function request(status: ProjectStatus, runner: Runner, context?: C) {
    return attempt(status, runner, {}, context as C);
  }

  async function choose(extra: StatusChangeOptions) {
    if (!pending) return;

    setBusy(true);
    await attempt(
      pending.status,
      pending.runner,
      { ...pending.answered, ...extra },
      pending.context,
    );
    setBusy(false);
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
    <>
      <ReasonDialog
        open={pending?.step === "reason"}
        title="Motivo do cancelamento"
        description="Quem abriu a solicitação vai ler este texto. Explique por que ela está sendo cancelada ou recusada."
        label="Motivo (visível para o solicitante)"
        confirmLabel="Cancelar solicitação"
        destructive
        busy={busy}
        onConfirm={(reason) => choose({ closeReason: reason })}
        onClose={() => setPending(null)}
      />
      <OpenTasksDialog
        open={pending?.step === "tasks"}
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
    </>
  );

  return { request, dialog };
}
