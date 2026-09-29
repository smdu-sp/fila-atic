"use server";

import type { MailLog } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { renderEmail } from "@/lib/emailTemplate";
import { sendMail } from "@/lib/mail";
import { resolveTransportConfig } from "@/lib/mailTransport";
import { prisma } from "@/lib/prisma";
import { isCoordination } from "@/lib/roles";

// Administração > E-mail: whether the app can reach the relay, and a "send a
// test message" button, since a delivery failure otherwise only shows up as a
// line in the server's own console (see lib/mail.ts).

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type MailStatus = {
  configured: boolean;
  host: string | null;
  port: number | null;
  secure: boolean;
  // whether SMTP_USER/SMTP_PASS are set; the credentials themselves never
  // leave the server
  authenticated: boolean;
  from: string | null;
  rejectUnauthorized: boolean;
  recent: MailLog[];
};

async function coordinationOrError(): Promise<ActionResult<null>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!isCoordination(user.role)) return { success: false, error: "Sem permissao" };
  return { success: true, data: null };
}

export async function getMailStatus(): Promise<ActionResult<MailStatus>> {
  const auth = await coordinationOrError();
  if (!auth.success) return auth;

  const config = resolveTransportConfig(process.env);
  const recent = await prisma.mailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return {
    success: true,
    data: {
      configured: config !== null,
      host: config?.host ?? null,
      port: config?.port ?? null,
      secure: config?.secure ?? false,
      authenticated: Boolean(config?.auth),
      from: config?.from ?? null,
      rejectUnauthorized: config?.rejectUnauthorized ?? true,
      recent,
    },
  };
}

export async function sendTestEmail(to: string): Promise<ActionResult<void>> {
  const auth = await coordinationOrError();
  if (!auth.success) return auth;

  const email = String(to ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { success: false, error: "Informe um e-mail valido" };
  }

  try {
    const { html, text } = renderEmail({
      heading: "E-mail de teste",
      paragraphs: [
        "Este é um e-mail de teste enviado pela tela Administração > E-mail.",
        "Se você recebeu esta mensagem, a conexão com o servidor de e-mail está funcionando.",
      ],
    });

    await sendMail({ kind: "test", to: email, subject: "E-mail de teste - Fila ATIC", text, html });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Falha ao enviar o e-mail",
    };
  }

  return { success: true, data: undefined };
}
