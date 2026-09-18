"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ProjectStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  cancelGuestRequest,
  reopenGuestRequest,
} from "@/actions/publicRequestActions";
import {
  cancelMyRequest,
  reopenMyRequest,
} from "@/actions/requestLifecycleActions";
import { ReasonDialog } from "@/components/reason-dialog";
import { Button } from "@/components/ui/button";
import {
  REOPEN_WINDOW_DAYS,
  REQUESTER_CANCELABLE,
  REOPENABLE,
} from "@/lib/requestLifecycleRules";

// What the person who opened a request can do with it: cancel while it has
// not started, reopen for a while after it closed. Works for people with an
// account and for guests using their tracking link.
export function RequesterActions({
  projectId,
  token,
  status,
  reopenUntil,
}: {
  projectId: string;
  // set for guests (their tracking token); accounts leave it out
  token?: string;
  status: ProjectStatus;
  // until when reopening is allowed; null when it is not (the server only
  // sends a date that is still in the future)
  reopenUntil: Date | string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"cancel" | "reopen" | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCancel = REQUESTER_CANCELABLE.includes(status);
  const canReopen = REOPENABLE.includes(status) && reopenUntil !== null;

  if (!canCancel && !canReopen) return null;

  const submit = (reason: string) =>
    startTransition(async () => {
      const cancelling = dialog === "cancel";
      const result = token
        ? await (cancelling ? cancelGuestRequest : reopenGuestRequest)(token, reason)
        : await (cancelling ? cancelMyRequest : reopenMyRequest)({ projectId, reason });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(cancelling ? "Solicitação cancelada." : "Solicitação reaberta.");
      setDialog(null);
      router.refresh();
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 p-4 text-sm">
        <span className="min-w-0 flex-1 text-muted-foreground">
          {canCancel
            ? "Mudou de ideia ou não precisa mais? Você pode cancelar enquanto a solicitação não começou a ser desenvolvida."
            : `Ainda precisa disso? Você pode reabrir esta solicitação por até ${REOPEN_WINDOW_DAYS} dias após o encerramento.`}
        </span>
        {canCancel ? (
          <Button variant="outline" onClick={() => setDialog("cancel")}>
            Cancelar solicitação
          </Button>
        ) : (
          <Button onClick={() => setDialog("reopen")}>Reabrir solicitação</Button>
        )}
      </div>

      <ReasonDialog
        open={dialog === "cancel"}
        title="Cancelar solicitação"
        description="A equipe será avisada. Conte por que você está cancelando."
        confirmLabel="Cancelar solicitação"
        destructive
        busy={isPending}
        onConfirm={submit}
        onClose={() => setDialog(null)}
      />
      <ReasonDialog
        open={dialog === "reopen"}
        title="Reabrir solicitação"
        description="Ela volta para a fila da coordenação. Explique o que mudou ou por que ainda é necessária."
        confirmLabel="Reabrir solicitação"
        busy={isPending}
        onConfirm={submit}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
