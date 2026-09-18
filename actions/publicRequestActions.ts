"use server";

import { ProjectPriority, ProjectStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { sendConfirmationEmail, sendTrackingEmail } from "@/lib/guestMail";
import {
  CONFIRM_TOKEN_TTL_MS,
  consumeAttempt,
  generateToken,
  getAllowedEmailDomains,
  getClientKey,
  hashToken,
  isAllowedEmail,
  isPublicRequestEnabled,
  isValidTokenFormat,
  keyFor,
  MAX_PENDING_PER_EMAIL,
  RATE_LIMITS,
} from "@/lib/publicRequest";
import {
  hasCustomValue,
  parseMultiValue,
  parseOptions,
  type ProjectRequestFieldConfig,
} from "@/lib/requestForm";
import { loadRequestFields } from "@/lib/requestFormServer";
import {
  notifyNewRequest,
  notifyTeamOfRequesterMessage,
} from "@/lib/notifications";
import { recordStatusChange } from "@/lib/projectStatus";
import { saveUploads, validateUploads } from "@/lib/uploads";

// Everything here is callable without a session, so each action validates its
// own input and trusts nothing but the confirmation/tracking token.

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const submitSchema = z.object({
  name: z.string().trim().min(3, "Informe seu nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail invalido").max(200),
  department: z.string().trim().min(2, "Informe seu setor").max(120),
  title: z.string().trim().min(3, "Informe o titulo").max(200),
  description: z.string().trim().min(10, "Informe a descricao").max(10000),
  justification: z
    .string()
    .trim()
    .min(10, "Informe a justificativa")
    .max(10000),
  customFields: z.record(z.string().max(5000).optional()).optional(),
  // Honeypot: hidden from people, filled in by naive bots.
  website: z.string().optional(),
});

export type PublicRequestInput = z.input<typeof submitSchema>;

function validateCustomFields(
  configs: ProjectRequestFieldConfig[],
  input: Record<string, string | undefined>,
): ActionResult<Record<string, string>> {
  const values: Record<string, string> = {};

  for (const field of configs) {
    if (field.isSystem || !field.isActive) continue;

    const raw = (input[field.id] ?? "").trim();

    if (!hasCustomValue(field.fieldType, raw)) {
      if (field.required) {
        return { success: false, error: `Campo obrigatorio: ${field.label}` };
      }
      continue;
    }

    const options = parseOptions(field.options);
    const invalid = { success: false, error: `Valor invalido: ${field.label}` } as const;

    if (field.fieldType === "SELECT" || field.fieldType === "RADIO") {
      if (options.length && !options.includes(raw)) return invalid;
      values[field.id] = raw;
    } else if (field.fieldType === "MULTI_SELECT") {
      const selected = parseMultiValue(raw);
      if (options.length && selected.some((item) => !options.includes(item))) {
        return invalid;
      }
      values[field.id] = JSON.stringify(selected);
    } else if (field.fieldType === "DATE") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return invalid;
      values[field.id] = raw;
    } else {
      if (raw.length > (field.fieldType === "TEXT" ? 500 : 5000)) {
        return invalid;
      }
      values[field.id] = raw;
    }
  }

  return { success: true, data: values };
}

export async function submitPublicRequest(
  input: PublicRequestInput,
): Promise<ActionResult<{ email: string }>> {
  if (!isPublicRequestEnabled()) {
    return { success: false, error: "Solicitacao publica indisponivel" };
  }

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dados invalidos",
    };
  }

  const data = parsed.data;

  if (data.website) {
    // Pretend it worked so bots get no signal to adapt to.
    return { success: true, data: { email: data.email } };
  }

  if (!isAllowedEmail(data.email)) {
    const domains = getAllowedEmailDomains()
      .map((domain) => `@${domain}`)
      .join(", ");
    return {
      success: false,
      error: `Use seu e-mail institucional (${domains})`,
    };
  }

  const fields = await loadRequestFields();
  const custom = validateCustomFields(fields, data.customFields ?? {});
  if (!custom.success) return custom;

  const allowed =
    (await consumeAttempt(RATE_LIMITS.submitGlobal, "all")) &&
    (await consumeAttempt(RATE_LIMITS.submitIp, await getClientKey())) &&
    (await consumeAttempt(RATE_LIMITS.submitEmail, keyFor(data.email)));

  if (!allowed) {
    return {
      success: false,
      error: "Muitas tentativas. Tente novamente mais tarde.",
    };
  }

  const now = new Date();
  await prisma.pendingGuestRequest.deleteMany({
    where: { expiresAt: { lt: now } },
  });

  const waiting = await prisma.pendingGuestRequest.count({
    where: { email: data.email, expiresAt: { gte: now } },
  });
  if (waiting >= MAX_PENDING_PER_EMAIL) {
    return {
      success: false,
      error:
        "Ja existem solicitacoes aguardando confirmacao neste e-mail. Confirme pelo link enviado ou aguarde a expiracao.",
    };
  }

  const token = generateToken();
  const pending = await prisma.pendingGuestRequest.create({
    data: {
      tokenHash: hashToken(token),
      name: data.name,
      email: data.email,
      department: data.department,
      title: data.title,
      description: data.description,
      justification: data.justification,
      customFields: Object.keys(custom.data).length
        ? JSON.stringify(custom.data)
        : null,
      expiresAt: new Date(now.getTime() + CONFIRM_TOKEN_TTL_MS),
    },
    select: { id: true },
  });

  try {
    await sendConfirmationEmail({
      to: data.email,
      name: data.name,
      title: data.title,
      token,
    });
  } catch (error) {
    console.error("Falha ao enviar e-mail de confirmacao", error);
    await prisma.pendingGuestRequest.delete({ where: { id: pending.id } });
    return {
      success: false,
      error:
        "Nao foi possivel enviar o e-mail de confirmacao. Tente novamente mais tarde.",
    };
  }

  return { success: true, data: { email: data.email } };
}

export async function confirmPublicRequest(
  token: string,
): Promise<ActionResult<{ trackingToken: string }>> {
  const expired = {
    success: false,
    error: "Link invalido, ja utilizado ou expirado. Envie a solicitacao novamente.",
  } as const;

  if (!isPublicRequestEnabled() || !isValidTokenFormat(token)) return expired;

  const pending = await prisma.pendingGuestRequest.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!pending || pending.expiresAt < new Date()) return expired;

  if (!isAllowedEmail(pending.email)) {
    return { success: false, error: "E-mail nao autorizado" };
  }

  // Registered users may have their e-mail stored in any case (e.g. taken
  // from the directory), while the public form always lowercases it.
  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: { equals: pending.email, mode: "insensitive" } },
        { login: { equals: pending.email, mode: "insensitive" } },
      ],
    },
  });

  // A registered user who was deactivated must not get requests through here.
  if (existing && !existing.isGuest && !existing.isActive) {
    return {
      success: false,
      error: "Nao foi possivel registrar a solicitacao. Contate o suporte.",
    };
  }

  const customValues = pending.customFields
    ? (JSON.parse(pending.customFields) as Record<string, string>)
    : {};
  const activeFieldIds = new Set(
    (
      await prisma.projectRequestField.findMany({
        where: { isSystem: false, isActive: true },
        select: { id: true },
      })
    ).map((field) => field.id),
  );
  const trackingToken = generateToken();

  const created = await prisma.$transaction(async (tx) => {
    // Claiming the pending row first makes a double click (or two tabs)
    // create a single project.
    const claimed = await tx.pendingGuestRequest.deleteMany({
      where: { id: pending.id },
    });
    if (claimed.count === 0) return null;

    const requester = existing
      ? existing.isGuest
        ? await tx.user.update({
            where: { id: existing.id },
            data: { name: pending.name, department: pending.department },
          })
        : existing
      : await tx.user.create({
          data: {
            login: pending.email,
            email: pending.email,
            name: pending.name,
            department: pending.department,
            role: Role.REQUESTER,
            isGuest: true,
          },
        });

    const project = await tx.project.create({
      data: {
        title: pending.title,
        description: pending.description,
        justification: pending.justification,
        priority: ProjectPriority.MEDIUM,
        requesterId: requester.id,
        trackingToken,
      },
    });

    await recordStatusChange(tx, {
      projectId: project.id,
      from: null,
      to: project.status,
      byName: pending.name,
    });

    const values = Object.entries(customValues).filter(([fieldId]) =>
      activeFieldIds.has(fieldId),
    );
    if (values.length) {
      await tx.projectRequestFieldValue.createMany({
        data: values.map(([fieldId, value]) => ({
          projectId: project.id,
          fieldId,
          value,
        })),
      });
    }

    await tx.projectLog.create({
      data: {
        projectId: project.id,
        message: `Projeto "${pending.title}" criado pelo formulario publico.`,
        authorName: pending.name,
        isInternal: true,
      },
    });

    return project;
  });

  if (!created) return expired;

  await notifyNewRequest({
    projectId: created.id,
    title: pending.title,
    requesterName: pending.name,
    department: pending.department,
  });

  revalidatePath("/");
  revalidatePath("/fila");
  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");

  try {
    await sendTrackingEmail({
      to: pending.email,
      name: pending.name,
      title: pending.title,
      token: trackingToken,
    });
  } catch (error) {
    // The requester is sent to the tracking page right after this returns.
    console.error("Falha ao enviar e-mail com o link de acompanhamento", error);
  }

  return { success: true, data: { trackingToken } };
}

export async function createGuestMessage(
  formData: FormData,
): Promise<ActionResult<void>> {
  const token = String(formData.get("token") ?? "");
  const message = String(formData.get("message") ?? "").trim();
  const files = formData
    .getAll("attachments")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (!isValidTokenFormat(token)) {
    return { success: false, error: "Solicitacao nao encontrada" };
  }

  const project = await prisma.project.findUnique({
    where: { trackingToken: token },
    select: { id: true, status: true, requester: { select: { name: true } } },
  });

  if (!project) {
    return { success: false, error: "Solicitacao nao encontrada" };
  }

  if (
    project.status === ProjectStatus.FINISHED ||
    project.status === ProjectStatus.CANCELED
  ) {
    return { success: false, error: "Esta solicitacao ja foi encerrada" };
  }

  const hasMessage = message.length >= 3;
  if (!hasMessage && files.length === 0) {
    return { success: false, error: "Mensagem muito curta" };
  }
  if (message.length > 5000) {
    return { success: false, error: "Mensagem muito longa" };
  }

  const uploadError = validateUploads(files);
  if (uploadError) {
    return { success: false, error: uploadError };
  }

  if (!(await consumeAttempt(RATE_LIMITS.reply, project.id))) {
    return {
      success: false,
      error: "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
    };
  }

  const attachments = await saveUploads(files);
  const data = {
    projectId: project.id,
    message: hasMessage ? message : "",
    authorName: project.requester.name,
    isInternal: false,
  };

  await prisma.projectLog.create({
    data:
      attachments.length > 0
        ? { ...data, attachments: { create: attachments } }
        : data,
  });

  await notifyTeamOfRequesterMessage({
    projectId: project.id,
    fromName: project.requester.name,
  });

  revalidatePath(`/acompanhar/${token}`);
  revalidatePath(`/solicitacoes/${project.id}`);
  revalidatePath("/logs");

  return { success: true, data: undefined };
}
