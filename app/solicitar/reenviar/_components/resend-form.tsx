"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { resendTrackingLinks } from "@/actions/publicRequestActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResendForm({ domains }: { domains: string[] }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await resendTrackingLinks(email);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setSent(true);
    });

  if (sent) {
    return (
      <div className="grid gap-3 text-sm" role="status">
        <p className="text-base font-semibold">Confira o seu e-mail</p>
        <p>
          Se houver solicitações abertas com o endereço{" "}
          <strong>{email}</strong>, enviamos os links de acompanhamento para
          ele. Olhe também a caixa de spam.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setSent(false);
            setEmail("");
          }}
        >
          Usar outro e-mail
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="resend-email">E-mail usado na solicitação</Label>
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          placeholder={domains.length ? `nome@${domains[0]}` : "nome@dominio.gov.br"}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={isPending || !email.trim()}>
        {isPending ? "Enviando" : "Enviar meus links"}
      </Button>
    </form>
  );
}
