"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessProject } from "@/lib/projectAccess";
import {
  normalizeReason,
  REASON_ERROR,
  requesterCancels,
  requesterReopens,
} from "@/lib/requestLifecycle";
import { saveUploads, validateUploads } from "@/lib/uploads";

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type ReasonInput = { projectId: string; reason: string };

function refresh(projectId: string) {
  revalidatePath(`/solicitacoes/${projectId}`);
  revalidatePath("/fila");
  revalidatePath("/projetos");
  revalidatePath("/kanban");
  revalidatePath("/logs");
  revalidatePath("/");
}

// Only the person who opened the request (not merely anyone who can read it).
type Owner =
  | { ok: false; error: string }
  | { ok: true; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> };

async function ownRequest(projectId: string): Promise<Owner> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Nao autenticado" };

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { requesterId: true },
  });

  if (!project || project.requesterId !== user.id) {
    return { ok: false, error: "Sem permissao" };
  }

  return { ok: true, user };
}

export async function cancelMyRequest(
  input: ReasonInput,
): Promise<ActionResult<void>> {
  const owner = await ownRequest(input.projectId);
  if (!owner.ok) return { success: false, error: owner.error };

  const reason = normalizeReason(input.reason);
  if (!reason) return { success: false, error: REASON_ERROR };

  const result = await requesterCancels(
    input.projectId,
    { id: owner.user.id, name: owner.user.name },
    reason,
  );
  if (!result.success) return result;

  refresh(input.projectId);
  return { success: true, data: undefined };
}

export async function reopenMyRequest(
  input: ReasonInput,
): Promise<ActionResult<void>> {
  const owner = await ownRequest(input.projectId);
  if (!owner.ok) return { success: false, error: owner.error };

  const reason = normalizeReason(input.reason);
  if (!reason) return { success: false, error: REASON_ERROR };

  const result = await requesterReopens(
    input.projectId,
    { id: owner.user.id, name: owner.user.name },
    reason,
  );
  if (!result.success) return result;

  refresh(input.projectId);
  return { success: true, data: undefined };
}

// Files chosen in the "new request" form: the request is created first and the
// files follow, as a message in the conversation.
export async function addRequestAttachments(
  formData: FormData,
): Promise<ActionResult<void>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };

  const projectId = String(formData.get("projectId") ?? "");
  const files = formData
    .getAll("attachments")
    .filter((file): file is File => file instanceof File && file.size > 0);

  if (!projectId || files.length === 0) {
    return { success: false, error: "Nenhum arquivo enviado" };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { requesterId: true },
  });
  if (!project) return { success: false, error: "Solicitacao nao encontrada" };

  const allowed =
    project.requesterId === user.id ||
    (await canAccessProject(user.id, user.role, projectId));
  if (!allowed) return { success: false, error: "Sem permissao" };

  const uploadError = validateUploads(files);
  if (uploadError) return { success: false, error: uploadError };

  const attachments = await saveUploads(files);
  await prisma.projectLog.create({
    data: {
      projectId,
      message: "Anexos enviados na abertura da solicitação.",
      authorName: user.name,
      isInternal: false,
      attachments: { create: attachments },
    },
  });

  refresh(projectId);
  return { success: true, data: undefined };
}
