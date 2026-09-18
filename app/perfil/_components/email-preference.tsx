"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { setEmailNotifications } from "@/actions/notificationActions";

export function EmailPreference({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [isPending, startTransition] = useTransition();

  const change = (next: boolean) => {
    const previous = enabled;
    setEnabled(next);

    startTransition(async () => {
      const result = await setEmailNotifications(next);
      if (!result.success) {
        setEnabled(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        next ? "Avisos por e-mail ativados." : "Avisos por e-mail desativados.",
      );
    });
  };

  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        disabled={isPending}
        onChange={(event) => change(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">Receber avisos por e-mail</span>
        <span className="text-xs text-muted-foreground">
          Os avisos continuam aparecendo no sino do sistema mesmo com o e-mail
          desligado.
        </span>
      </span>
    </label>
  );
}
