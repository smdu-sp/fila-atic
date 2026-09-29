"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { sendTestEmail } from "@/actions/mailActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TestEmailForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [to, setTo] = useState(defaultEmail);

  const send = () =>
    startTransition(async () => {
      const result = await sendTestEmail(to);
      if (!result.success) {
        toast.error(result.error);
      } else {
        toast.success("E-mail de teste enviado. Confira a caixa de entrada (e o spam) em alguns minutos.");
      }
      // Either way there is a new line in "Últimos e-mails" below (a failed
      // attempt is exactly what this log exists to surface).
      router.refresh();
    });

  return (
    <form
      className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,20rem)_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="mail-test-to">Enviar e-mail de teste para</Label>
        <Input
          id="mail-test-to"
          type="email"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="voce@exemplo.gov.br"
        />
      </div>
      <Button type="submit" disabled={isPending || !to.trim()}>
        {isPending ? "Enviando" : "Enviar teste"}
      </Button>
    </form>
  );
}
