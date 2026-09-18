import type { Metadata } from "next";
import Link from "next/link";

import { ConfirmButton } from "@/app/solicitar/confirmar/[token]/_components/confirm-button";
import { PublicShell } from "@/app/solicitar/_components/public-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPendingByToken } from "@/lib/guestTracking";

export const metadata: Metadata = {
  title: "Confirmar solicitação - Fila Atic",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// Confirmation needs a click instead of happening on GET: mail scanners open
// links automatically and would otherwise consume the token.
export default async function ConfirmRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const pending = await getPendingByToken(token);

  if (!pending) {
    return (
      <PublicShell>
        <Card>
          <CardHeader>
            <CardTitle>Link inválido ou expirado</CardTitle>
            <CardDescription>
              Este link já foi usado ou passou de 24 horas.{" "}
              <Link href="/solicitar" className="underline">
                Enviar a solicitação novamente
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <Card>
        <CardHeader>
          <CardTitle>Confirmar solicitação</CardTitle>
          <CardDescription>
            Olá, {pending.name}. Confirme para registrar a solicitação abaixo
            na fila.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{pending.title}</p>
            <p className="text-muted-foreground">{pending.email}</p>
          </div>
          <ConfirmButton token={token} />
        </CardContent>
      </Card>
    </PublicShell>
  );
}
