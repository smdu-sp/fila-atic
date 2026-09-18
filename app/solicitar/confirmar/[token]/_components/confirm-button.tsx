"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { confirmPublicRequest } from "@/actions/publicRequestActions";
import { Button } from "@/components/ui/button";

export function ConfirmButton({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = () => {
    startTransition(async () => {
      setError(null);
      const result = await confirmPublicRequest(token);
      if (!result.success) {
        setError(result.error);
        return;
      }

      router.replace(`/acompanhar/${result.data.trackingToken}`);
    });
  };

  return (
    <div className="grid gap-2">
      <Button onClick={handleConfirm} disabled={isPending}>
        {isPending ? "Confirmando" : "Confirmar solicitação"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
