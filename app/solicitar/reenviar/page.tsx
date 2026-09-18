import type { Metadata } from "next";
import Link from "next/link";

import { ResendForm } from "@/app/solicitar/reenviar/_components/resend-form";
import { PublicShell } from "@/app/solicitar/_components/public-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getAllowedEmailDomains,
  isPublicRequestEnabled,
} from "@/lib/publicRequest";

export const metadata: Metadata = {
  title: "Reenviar link - Fila Atic",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function ResendLinksPage() {
  if (!isPublicRequestEnabled()) {
    return (
      <PublicShell>
        <Card>
          <CardHeader>
            <CardTitle>Serviço indisponível</CardTitle>
            <CardDescription>
              <Link href="/login" className="underline">
                Entrar no sistema
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
          <CardTitle>Perdeu o link da sua solicitação?</CardTitle>
          <CardDescription>
            Informe o e-mail que usou ao abrir a solicitação. Enviamos para ele
            os links das solicitações em andamento (e das encerradas nos
            últimos 90 dias).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResendForm domains={getAllowedEmailDomains()} />
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/solicitar" className="underline">
          Voltar para a solicitação
        </Link>
      </p>
    </PublicShell>
  );
}
