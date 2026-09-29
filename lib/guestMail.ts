import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mail";
import { CONFIRM_TOKEN_TTL_MS, getAppUrl } from "@/lib/publicRequest";

const SIGNATURE = "Fila ATIC - Secretaria Municipal de Urbanismo e Licenciamento";

export function confirmationLink(token: string) {
  return `${getAppUrl()}/solicitar/confirmar/${token}`;
}

export function trackingLink(token: string) {
  return `${getAppUrl()}/acompanhar/${token}`;
}

export async function sendConfirmationEmail(input: {
  to: string;
  name: string;
  title: string;
  token: string;
}) {
  const hours = CONFIRM_TOKEN_TTL_MS / 60 / 60 / 1000;

  await sendMail({
    kind: "confirmation",
    to: input.to,
    subject: "Confirme sua solicitação - Fila ATIC",
    text: [
      `Olá, ${input.name}.`,
      "",
      `Recebemos a solicitação "${input.title}". Para registrá-la na fila, confirme seu e-mail pelo link abaixo (válido por ${hours} horas):`,
      "",
      confirmationLink(input.token),
      "",
      "Se você não fez essa solicitação, ignore esta mensagem. Nada será registrado.",
      "",
      SIGNATURE,
    ].join("\n"),
  });
}

export async function sendTrackingEmail(input: {
  to: string;
  name: string;
  title: string;
  token: string;
}) {
  await sendMail({
    kind: "tracking",
    to: input.to,
    subject: "Solicitação registrada - Fila ATIC",
    text: [
      `Olá, ${input.name}.`,
      "",
      `Sua solicitação "${input.title}" foi registrada na fila. Use o link abaixo para acompanhar o andamento e responder à equipe:`,
      "",
      trackingLink(input.token),
      "",
      "Guarde este e-mail: o link é pessoal e dá acesso à solicitação. Não o compartilhe.",
      "",
      SIGNATURE,
    ].join("\n"),
  });
}

// Every open (or recently closed) request of one e-mail address, in a single
// message, for people who lost the first e-mail.
export async function sendTrackingLinksEmail(input: {
  to: string;
  name: string;
  projects: Array<{ title: string; token: string }>;
}) {
  await sendMail({
    kind: "tracking",
    to: input.to,
    subject: "Seus links de acompanhamento - Fila ATIC",
    text: [
      `Olá, ${input.name}.`,
      "",
      "Você pediu os links das suas solicitações. Cada link é pessoal e dá acesso à solicitação; não o compartilhe.",
      "",
      ...input.projects.flatMap((project) => [
        `• ${project.title}`,
        `  ${trackingLink(project.token)}`,
        "",
      ]),
      "Se você não fez este pedido, ignore esta mensagem.",
      "",
      SIGNATURE,
    ].join("\n"),
  });
}

// Tells a guest requester that something changed. Never throws: a mail
// failure must not roll back or fail the staff action that triggered it. The
// message carries no content, only the link, so the text cannot be spoofed
// into a phishing payload.
export async function notifyGuestRequester(projectId: string, change: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        title: true,
        trackingToken: true,
        requester: { select: { name: true, email: true, isGuest: true } },
      },
    });

    if (!project?.trackingToken || !project.requester.isGuest) return;

    await sendMail({
      kind: "guest_update",
      to: project.requester.email,
      subject: `Atualização na solicitação "${project.title}" - Fila ATIC`,
      text: [
        `Olá, ${project.requester.name}.`,
        "",
        `${change} Acompanhe pelo link:`,
        "",
        trackingLink(project.trackingToken),
        "",
        SIGNATURE,
      ].join("\n"),
    });
  } catch (error) {
    console.error("Falha ao notificar solicitante convidado", error);
  }
}
