import type { Metadata } from "next";
import Link from "next/link";

import { CreateProjectForm } from "@/app/projetos/_components/create-project-form";
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
import { loadRequestFields } from "@/lib/requestFormServer";

export const metadata: Metadata = {
  title: "Nova solicitação - Fila Atic",
};

// The form fields (edited by coordinators) and the allowed domains (env) are
// read on every request, never frozen at build time.
export const dynamic = "force-dynamic";

export default async function PublicRequestPage() {
  if (!isPublicRequestEnabled()) {
    return (
      <PublicShell>
        <Card>
          <CardHeader>
            <CardTitle>Formulário indisponível</CardTitle>
            <CardDescription>
              A abertura de solicitações sem conta não está habilitada no
              momento.{" "}
              <Link href="/login" className="underline">
                Entrar no sistema
              </Link>
            </CardDescription>
          </CardHeader>
        </Card>
      </PublicShell>
    );
  }

  const fields = await loadRequestFields();
  const domains = getAllowedEmailDomains();

  return (
    <PublicShell>
      <Card>
        <CardHeader>
          <CardTitle>Nova solicitação</CardTitle>
          <CardDescription>
            Não tem acesso ao sistema? Preencha o formulário com seu e-mail
            institucional. Enviaremos um link para confirmar a solicitação e
            depois para acompanhá-la.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateProjectForm guest fields={fields} allowedDomains={domains} />
        </CardContent>
      </Card>
      <p className="text-center text-sm text-muted-foreground">
        Já tem acesso?{" "}
        <Link href="/login" className="underline">
          Entrar no sistema
        </Link>
        {" · "}
        <Link href="/solicitar/reenviar" className="underline">
          Perdi o link da minha solicitação
        </Link>
      </p>
    </PublicShell>
  );
}
