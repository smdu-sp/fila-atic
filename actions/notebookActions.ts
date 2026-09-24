"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isStaffRole } from "@/lib/roles";
import { deleteUploads, saveUploads, validateUploads } from "@/lib/uploads";
import {
  normalizeBlocks,
  parseContent,
  sameBlocks,
  serializeBlocks,
  type Block,
} from "@/lib/wikiBlocks";

// The internal wiki: a tree of Markdown pages, staff-only (never requesters
// or guests). Anyone on staff may create, edit or delete any page — it is
// meant to be maintained collectively, like a real wiki.

type ActionResult<T> =
  { success: true; data: T } | { success: false; error: string };

export type NotebookTreeNode = {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
};

export type NotebookRevision = {
  id: string;
  editedByName: string;
  editedAt: Date;
};

export type NotebookAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number;
  uploadedByName: string;
  createdAt: Date;
};

export type NotebookPageDetail = {
  id: string;
  title: string;
  // the page body; pages written as Markdown come back converted
  blocks: Block[];
  parentId: string | null;
  position: number;
  createdByName: string;
  createdAt: Date;
  updatedByName: string;
  updatedAt: Date;
  breadcrumbs: Array<{ id: string; title: string }>;
  revisions: NotebookRevision[];
  attachments: NotebookAttachment[];
};

async function staffOrError(): Promise<
  ActionResult<{ id: string; name: string }>
> {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "Nao autenticado" };
  if (!isStaffRole(user.role))
    return { success: false, error: "Sem permissao" };
  return { success: true, data: { id: user.id, name: user.name } };
}

// The page lives at /wiki?p=<id>, a single route with a search param, not a
// nested one, so revalidating the route itself covers every page.
function refresh() {
  revalidatePath("/wiki");
}

// The whole tree, flat: the client builds the hierarchy from parentId.
export async function listNotebookTree(): Promise<
  ActionResult<NotebookTreeNode[]>
> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const pages = await prisma.notebookPage.findMany({
    select: { id: true, title: true, parentId: true, position: true },
    orderBy: [{ position: "asc" }, { title: "asc" }],
  });

  return { success: true, data: pages };
}

async function breadcrumbsOf(pageId: string | null) {
  const trail: Array<{ id: string; title: string }> = [];
  let currentId = pageId;

  // A wiki this size never nests deep enough for this loop to matter.
  while (currentId) {
    const page = await prisma.notebookPage.findUnique({
      where: { id: currentId },
      select: { id: true, title: true, parentId: true },
    });
    if (!page) break;
    trail.unshift({ id: page.id, title: page.title });
    currentId = page.parentId;
  }

  return trail;
}

export async function getNotebookPage(
  pageId: string,
): Promise<ActionResult<NotebookPageDetail>> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const page = await prisma.notebookPage.findUnique({
    where: { id: String(pageId ?? "") },
    include: {
      revisions: {
        orderBy: { editedAt: "desc" },
        take: 20,
        select: { id: true, editedByName: true, editedAt: true },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileName: true,
          fileUrl: true,
          fileType: true,
          fileSize: true,
          uploadedByName: true,
          createdAt: true,
        },
      },
    },
  });
  if (!page) return { success: false, error: "Pagina nao encontrada" };

  return {
    success: true,
    data: {
      id: page.id,
      title: page.title,
      blocks: parseContent(page.content),
      parentId: page.parentId,
      position: page.position,
      createdByName: page.createdByName,
      createdAt: page.createdAt,
      updatedByName: page.updatedByName,
      updatedAt: page.updatedAt,
      breadcrumbs: await breadcrumbsOf(page.id),
      revisions: page.revisions,
      attachments: page.attachments,
    },
  };
}

async function nextPosition(parentId: string | null) {
  const last = await prisma.notebookPage.findFirst({
    where: { parentId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

export async function createNotebookPage(input: {
  title: string;
  parentId?: string | null;
}): Promise<ActionResult<string>> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const title = String(input.title ?? "").trim();
  if (!title) return { success: false, error: "Informe o titulo" };

  const parentId = input.parentId || null;
  if (parentId) {
    const parent = await prisma.notebookPage.findUnique({
      where: { id: parentId },
      select: { id: true },
    });
    if (!parent) return { success: false, error: "Pagina pai nao encontrada" };
  }

  const page = await prisma.notebookPage.create({
    data: {
      title,
      content: "",
      parentId,
      position: await nextPosition(parentId),
      createdById: auth.data.id,
      createdByName: auth.data.name,
      updatedByName: auth.data.name,
    },
  });

  refresh();
  return { success: true, data: page.id };
}

// A page may not become its own descendant.
async function wouldCreateCycle(
  pageId: string,
  newParentId: string,
): Promise<boolean> {
  let currentId: string | null = newParentId;
  while (currentId) {
    if (currentId === pageId) return true;
    const parent: { parentId: string | null } | null =
      await prisma.notebookPage.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });
    currentId = parent?.parentId ?? null;
  }
  return false;
}

export async function updateNotebookPage(input: {
  id: string;
  title?: string;
  // The body, as blocks (what the editor sends). `content` is the same thing
  // as text (JSON of blocks, or Markdown), kept for callers that only have
  // text; `blocks` wins when both are given.
  blocks?: unknown;
  content?: string;
  // undefined leaves it, null moves to the root.
  parentId?: string | null;
}): Promise<ActionResult<void>> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const page = await prisma.notebookPage.findUnique({
    where: { id: String(input.id ?? "") },
    select: { id: true, title: true, content: true },
  });
  if (!page) return { success: false, error: "Pagina nao encontrada" };

  const title = input.title !== undefined ? input.title.trim() : undefined;
  if (title !== undefined && !title) {
    return { success: false, error: "Informe o titulo" };
  }

  if (input.parentId) {
    if (input.parentId === page.id) {
      return {
        success: false,
        error: "Uma pagina nao pode ser pai dela mesma",
      };
    }
    const parent = await prisma.notebookPage.findUnique({
      where: { id: input.parentId },
      select: { id: true },
    });
    if (!parent) return { success: false, error: "Pagina pai nao encontrada" };
    if (await wouldCreateCycle(page.id, input.parentId)) {
      return {
        success: false,
        error: "Nao e possivel mover uma pagina para dentro dela mesma",
      };
    }
  }

  let nextBlocks: Block[] | undefined;
  if (input.blocks !== undefined) {
    const valid = normalizeBlocks(input.blocks);
    if (!valid) return { success: false, error: "Conteudo invalido" };
    nextBlocks = valid;
  } else if (input.content !== undefined) {
    nextBlocks = parseContent(input.content);
  }

  // Compared without ids: a page still stored as Markdown gets new ids on
  // every read, and saving it untouched must not count as an edit.
  const contentChanged =
    nextBlocks !== undefined &&
    !sameBlocks(nextBlocks, parseContent(page.content));
  const titleChanged = title !== undefined && title !== page.title;

  await prisma.$transaction(async (tx) => {
    await tx.notebookPage.update({
      where: { id: page.id },
      data: {
        title,
        content:
          contentChanged && nextBlocks ? serializeBlocks(nextBlocks) : undefined,
        parentId:
          input.parentId !== undefined ? input.parentId || null : undefined,
        position:
          input.parentId !== undefined
            ? await nextPosition(input.parentId || null)
            : undefined,
        updatedByName: auth.data.name,
      },
    });

    if (contentChanged || titleChanged) {
      await tx.notebookPageRevision.create({
        data: { pageId: page.id, editedByName: auth.data.name },
      });
    }
  });

  // Images that were uploaded while editing but are no longer in the page
  // (block deleted, edit abandoned earlier) go away with the save.
  if (contentChanged && nextBlocks) {
    const used = new Set(
      nextBlocks.flatMap((block) => (block.url ? [block.url] : [])),
    );
    const orphans = await prisma.notebookPageAttachment.findMany({
      where: { pageId: page.id, fileUrl: { notIn: [...used] } },
      select: { id: true, fileUrl: true },
    });
    if (orphans.length) {
      await prisma.notebookPageAttachment.deleteMany({
        where: { id: { in: orphans.map((orphan) => orphan.id) } },
      });
      await deleteUploads(orphans.map((orphan) => orphan.fileUrl));
    }
  }

  refresh();
  return { success: true, data: undefined };
}

// Reorders a page among siblings, optionally moving it under a different
// parent first (drag-and-drop in the tree: dropping a page "into" another
// reparents it; dropping it "before/after" another places it as that page's
// sibling, at that exact spot, even across parents, in one step).
export async function reorderNotebookPage(input: {
  id: string;
  // New parent to place the page under; undefined keeps its current one.
  parentId?: string | null;
  // Sibling (under the resulting parent) to place this page in front of;
  // null for the end of the list.
  beforeId: string | null;
}): Promise<ActionResult<void>> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const page = await prisma.notebookPage.findUnique({
    where: { id: String(input.id ?? "") },
    select: { id: true, parentId: true },
  });
  if (!page) return { success: false, error: "Pagina nao encontrada" };

  const targetParentId =
    input.parentId !== undefined ? input.parentId || null : page.parentId;

  if (targetParentId === page.id) {
    return { success: false, error: "Uma pagina nao pode ser pai dela mesma" };
  }
  if (targetParentId && targetParentId !== page.parentId) {
    const parent = await prisma.notebookPage.findUnique({
      where: { id: targetParentId },
      select: { id: true },
    });
    if (!parent) return { success: false, error: "Pagina pai nao encontrada" };
    if (await wouldCreateCycle(page.id, targetParentId)) {
      return {
        success: false,
        error: "Nao e possivel mover uma pagina para dentro dela mesma",
      };
    }
  }

  const siblings = await prisma.notebookPage.findMany({
    where: { parentId: targetParentId, id: { not: page.id } },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });

  const index =
    input.beforeId === null
      ? siblings.length
      : siblings.findIndex((s) => s.id === input.beforeId);
  if (index === -1) return { success: false, error: "Posicao invalida" };

  const previous = siblings[index - 1];
  const next = siblings[index];
  const position =
    previous && next
      ? (previous.position + next.position) / 2
      : next
        ? next.position - 1
        : previous
          ? previous.position + 1
          : 0;

  await prisma.notebookPage.update({
    where: { id: page.id },
    data: { parentId: targetParentId, position },
  });

  refresh();
  return { success: true, data: undefined };
}

// Ids of a page and every descendant, gathered level by level (a wiki never
// nests deep enough to need a recursive query for this).
async function subtreeIds(rootId: string) {
  const ids = [rootId];
  let level = [rootId];

  while (level.length) {
    const children = await prisma.notebookPage.findMany({
      where: { parentId: { in: level } },
      select: { id: true },
    });
    level = children.map((c) => c.id);
    ids.push(...level);
  }

  return ids;
}

export async function deleteNotebookPage(
  pageId: string,
): Promise<ActionResult<void>> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const page = await prisma.notebookPage.findUnique({
    where: { id: String(pageId ?? "") },
    select: { id: true },
  });
  if (!page) return { success: false, error: "Pagina nao encontrada" };

  const ids = await subtreeIds(page.id);
  const attachments = await prisma.notebookPageAttachment.findMany({
    where: { pageId: { in: ids } },
    select: { fileUrl: true },
  });

  // The parent's foreign key cascades the whole subtree in one go.
  await prisma.notebookPage.delete({ where: { id: page.id } });
  await deleteUploads(attachments.map((a) => a.fileUrl));

  refresh();
  return { success: true, data: undefined };
}

export async function addNotebookPageImage(
  formData: FormData,
): Promise<ActionResult<{ fileName: string; fileUrl: string }>> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const pageId = String(formData.get("pageId") ?? "");
  const page = await prisma.notebookPage.findUnique({
    where: { id: pageId },
    select: { id: true },
  });
  if (!page) return { success: false, error: "Pagina nao encontrada" };

  const files = formData
    .getAll("image")
    .filter((file): file is File => file instanceof File && file.size > 0);
  if (files.length === 0) {
    return { success: false, error: "Nenhum arquivo enviado" };
  }

  const uploadError = validateUploads(files);
  if (uploadError) return { success: false, error: uploadError };

  const [saved] = await saveUploads(files);

  await prisma.notebookPageAttachment.create({
    data: {
      pageId: page.id,
      ...saved,
      uploadedById: auth.data.id,
      uploadedByName: auth.data.name,
    },
  });

  refresh();
  return {
    success: true,
    data: { fileName: saved.fileName, fileUrl: saved.fileUrl },
  };
}

export async function deleteNotebookPageAttachment(
  attachmentId: string,
): Promise<ActionResult<void>> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const attachment = await prisma.notebookPageAttachment.findUnique({
    where: { id: String(attachmentId ?? "") },
    select: { id: true, pageId: true, fileUrl: true },
  });
  if (!attachment) return { success: false, error: "Anexo nao encontrado" };

  await prisma.notebookPageAttachment.delete({ where: { id: attachment.id } });
  await deleteUploads([attachment.fileUrl]);

  refresh();
  return { success: true, data: undefined };
}

export async function searchNotebookPages(
  q: string,
): Promise<ActionResult<Array<{ id: string; title: string }>>> {
  const auth = await staffOrError();
  if (!auth.success) return auth;

  const query = String(q ?? "")
    .trim()
    .slice(0, 100);
  if (!query) return { success: true, data: [] };

  const pages = await prisma.notebookPage.findMany({
    where: { title: { contains: query, mode: "insensitive" } },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
    take: 20,
  });

  return { success: true, data: pages };
}
