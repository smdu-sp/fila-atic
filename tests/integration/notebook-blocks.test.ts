import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import {
  addNotebookPageImage,
  createNotebookPage,
  getNotebookPage,
  reorderNotebookPage,
  updateNotebookPage,
} from "@/actions/notebookActions";
import { deleteUploads } from "@/lib/uploads";
import { serializeBlocks, type Block } from "@/lib/wikiBlocks";
import { EDIT_CONFLICT_ERROR } from "@/lib/wikiEditing";
import { actAs, makeUser, prisma, resetDb } from "../helpers";

vi.mock("@/lib/uploads", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/uploads")>();
  return {
    ...original,
    saveUploads: vi.fn(async (files: File[]) =>
      files.map((file) => ({
        fileName: file.name,
        fileUrl: `/uploads/fake-${file.name}`,
        fileType: file.type || null,
        fileSize: file.size,
      })),
    ),
    deleteUploads: vi.fn(async () => undefined),
    serveUpload: vi.fn(async () => new Response("ok", { status: 200 })),
  };
});

beforeEach(async () => {
  await resetDb();
  vi.mocked(deleteUploads).mockClear();
});

async function newPage() {
  const dev = await makeUser(Role.DEV_GLOBAL);
  actAs(dev);
  const page = await createNotebookPage({ title: "Runbook" });
  if (!page.success) throw new Error("create failed");
  return { dev, id: page.data };
}

const blocksOf = async (id: string) => {
  const result = await getNotebookPage(id);
  if (!result.success) throw new Error(result.error);
  return result.data.blocks;
};

const upload = async (pageId: string, name: string) => {
  const form = new FormData();
  form.set("pageId", pageId);
  form.set("image", new File(["x"], name, { type: "image/png" }));
  const result = await addNotebookPageImage(form);
  if (!result.success) throw new Error(result.error);
  return result.data.fileUrl;
};

describe("saving a page as blocks", () => {
  it("stores the blocks and returns them", async () => {
    const { id } = await newPage();
    expect(await blocksOf(id)).toEqual([]);

    const result = await updateNotebookPage({
      id,
      blocks: [
        { id: "a", type: "heading1", text: "Deploy" },
        { id: "b", type: "todo", text: "revisar", checked: true },
        { id: "c", type: "callout", text: "cuidado", icon: "⚠️" },
      ],
    });
    expect(result).toMatchObject({ success: true });

    expect(await blocksOf(id)).toEqual([
      { id: "a", type: "heading1", text: "Deploy" },
      { id: "b", type: "todo", text: "revisar", checked: true },
      { id: "c", type: "callout", text: "cuidado", icon: "⚠️" },
    ]);
    const stored = await prisma.notebookPage.findUniqueOrThrow({ where: { id } });
    expect(JSON.parse(stored.content)).toMatchObject({ v: 2 });
  });

  it("rejects invalid blocks and leaves the page as it was", async () => {
    const { id } = await newPage();
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "ok" }] });

    for (const bad of [
      [{ type: "script", text: "" }],
      [{ type: "image", text: "", url: "https://evil.example/x.png" }],
      "nao e lista",
      [{ id: "x", type: "paragraph" }, { id: "x", type: "paragraph" }],
    ]) {
      expect(await updateNotebookPage({ id, blocks: bad })).toMatchObject({
        success: false,
        error: "Conteudo invalido",
      });
    }
    expect(await blocksOf(id)).toEqual([{ id: "a", type: "paragraph", text: "ok" }]);
  });

  it("logs a revision only when the blocks really change", async () => {
    const { id } = await newPage();
    const blocks = [{ id: "a", type: "paragraph", text: "v1" }];

    await updateNotebookPage({ id, blocks });
    expect(await prisma.notebookPageRevision.count()).toBe(1);

    await updateNotebookPage({ id, blocks });
    expect(await prisma.notebookPageRevision.count()).toBe(1);

    // same content with other ids is not an edit either
    await updateNotebookPage({ id, blocks: [{ id: "zzz", type: "paragraph", text: "v1" }] });
    expect(await prisma.notebookPageRevision.count()).toBe(1);

    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "v2" }] });
    expect(await prisma.notebookPageRevision.count()).toBe(2);
  });

  it("ticking a to-do counts as an edit", async () => {
    const { id } = await newPage();
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "todo", text: "x", checked: false }] });
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "todo", text: "x", checked: true }] });

    expect(await prisma.notebookPageRevision.count()).toBe(2);
    expect((await blocksOf(id))[0]).toMatchObject({ checked: true });
  });
});

describe("pages written as Markdown", () => {
  it("come back converted to blocks, and saving them untouched is not an edit", async () => {
    const { id } = await newPage();
    await prisma.notebookPage.update({
      where: { id },
      data: { content: "# Guia\n\n- passo um\n- passo dois\n\ntexto **forte**" },
    });

    const blocks = await blocksOf(id);
    expect(blocks.map((b) => [b.type, b.text])).toEqual([
      ["heading1", "Guia"],
      ["bulleted", "passo um"],
      ["bulleted", "passo dois"],
      ["paragraph", "texto **forte**"],
    ]);

    await updateNotebookPage({ id, blocks });
    expect(await prisma.notebookPageRevision.count()).toBe(0);

    await updateNotebookPage({ id, blocks: [...blocks, { id: "n", type: "paragraph", text: "novo" }] });
    expect(await prisma.notebookPageRevision.count()).toBe(1);
    expect(JSON.parse((await prisma.notebookPage.findUniqueOrThrow({ where: { id } })).content)).toMatchObject({ v: 2 });
  });

  it("keep their images through the conversion", async () => {
    const { id } = await newPage();
    const url = await upload(id, "print.png");
    await prisma.notebookPage.update({ where: { id }, data: { content: `veja\n\n![tela](${url})` } });

    const blocks = await blocksOf(id);
    expect(blocks.at(-1)).toMatchObject({ type: "image", url, text: "tela" });

    await updateNotebookPage({ id, blocks: [...blocks, { id: "n", type: "paragraph", text: "fim" }] });
    expect(await prisma.notebookPageAttachment.count()).toBe(1);
    expect(vi.mocked(deleteUploads)).not.toHaveBeenCalled();
  });

  it("still accept text through the old `content` field", async () => {
    const { id } = await newPage();
    await updateNotebookPage({ id, content: "## Só texto" });
    expect((await blocksOf(id))[0]).toMatchObject({ type: "heading2", text: "Só texto" });

    await updateNotebookPage({ id, content: serializeBlocks([{ id: "q", type: "quote", text: "citado" }] as Block[]) });
    expect(await blocksOf(id)).toEqual([{ id: "q", type: "quote", text: "citado" }]);
  });
});

describe("images inside blocks", () => {
  it("are cleaned up when the block that showed them is gone", async () => {
    const { id } = await newPage();
    const kept = await upload(id, "fica.png");
    const gone = await upload(id, "sai.png");

    await updateNotebookPage({
      id,
      blocks: [
        { id: "1", type: "image", text: "", url: kept },
        { id: "2", type: "image", text: "", url: gone },
      ],
    });
    expect(await prisma.notebookPageAttachment.count()).toBe(2);

    await updateNotebookPage({ id, blocks: [{ id: "1", type: "image", text: "", url: kept }] });

    expect((await prisma.notebookPageAttachment.findMany()).map((a) => a.fileUrl)).toEqual([kept]);
    expect(vi.mocked(deleteUploads)).toHaveBeenCalledWith([gone]);
  });

  it("removing every image block removes every upload of the page, and other pages are untouched", async () => {
    const { id } = await newPage();
    const other = await createNotebookPage({ title: "Outra" });
    if (!other.success) throw new Error("create failed");
    const own = await upload(id, "a.png");
    const foreign = await upload(other.data, "b.png");

    await updateNotebookPage({ id, blocks: [{ id: "1", type: "paragraph", text: "sem imagem" }] });

    const left = await prisma.notebookPageAttachment.findMany();
    expect(left.map((a) => a.fileUrl)).toEqual([foreign]);
    expect(vi.mocked(deleteUploads)).toHaveBeenCalledWith([own]);
  });

  it("saving only the title touches neither the blocks nor the uploads", async () => {
    const { id } = await newPage();
    const url = await upload(id, "a.png");
    await updateNotebookPage({ id, blocks: [{ id: "1", type: "image", text: "", url }] });
    vi.mocked(deleteUploads).mockClear();

    await updateNotebookPage({ id, title: "Novo título" });

    expect(await prisma.notebookPageAttachment.count()).toBe(1);
    expect(vi.mocked(deleteUploads)).not.toHaveBeenCalled();
    expect(await blocksOf(id)).toHaveLength(1);
  });
});

describe("editing conflicts", () => {
  it("counts a version per save that changes title or body, and returns it", async () => {
    const { id } = await newPage();
    const first = await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "v1" }] });
    expect(first).toMatchObject({ success: true, data: { version: 1 } });

    // nothing changed: same version
    expect(await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "v1" }] })).toMatchObject({ data: { version: 1 } });
    expect(await updateNotebookPage({ id, title: "Outro" })).toMatchObject({ data: { version: 2 } });

    const details = await getNotebookPage(id);
    expect(details.success && details.data.version).toBe(2);
  });

  it("refuses a save made on top of an older version, leaving the page untouched", async () => {
    const { id } = await newPage();
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "minha" }], expectedVersion: 0 });

    // someone else saves in the meantime
    const other = await makeUser(Role.COORDINATOR);
    actAs(other);
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "dela" }], expectedVersion: 1 });

    const stale = await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "minha de novo" }], expectedVersion: 1 });
    expect(stale).toMatchObject({ success: false, error: EDIT_CONFLICT_ERROR });
    expect((await blocksOf(id))[0].text).toBe("dela");

    // without expectedVersion the caller chooses to overwrite
    expect(await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "por cima" }] })).toMatchObject({ success: true });
  });

  it("moving the page in the tree does not invalidate an open editor", async () => {
    const { id } = await newPage();
    const parent = await createNotebookPage({ title: "Pai" });
    if (!parent.success) throw new Error("create failed");
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "x" }] });

    await reorderNotebookPage({ id, parentId: parent.data, beforeId: null });

    expect(await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "y" }], expectedVersion: 1 })).toMatchObject({ success: true });
  });
});

describe("autosave", () => {
  it("folds saves by the same author into one recent revision, but not another author's", async () => {
    const { id } = await newPage();

    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "1" }], autosave: true });
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "12" }], autosave: true });
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "123" }], autosave: true });
    expect(await prisma.notebookPageRevision.count()).toBe(1);

    const other = await makeUser(Role.DEV_RESTRICTED);
    actAs(other);
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "1234" }], autosave: true });
    expect(await prisma.notebookPageRevision.count()).toBe(2);
  });

  it("starts a new revision once the previous one is old", async () => {
    const { id } = await newPage();
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "1" }], autosave: true });
    await prisma.notebookPageRevision.updateMany({ data: { editedAt: new Date(Date.now() - 11 * 60_000) } });

    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "12" }], autosave: true });
    expect(await prisma.notebookPageRevision.count()).toBe(2);
  });

  it("does not delete an image uploaded a moment ago that is not in the saved blocks yet", async () => {
    const { id } = await newPage();
    await upload(id, "recente.png");

    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "texto" }], autosave: true });
    expect(await prisma.notebookPageAttachment.count()).toBe(1);
    expect(vi.mocked(deleteUploads)).not.toHaveBeenCalled();

    // an old orphan does go
    await prisma.notebookPageAttachment.updateMany({ data: { createdAt: new Date(Date.now() - 11 * 60_000) } });
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "texto 2" }], autosave: true });
    expect(await prisma.notebookPageAttachment.count()).toBe(0);
  });

  it("a save that changes nothing does not mark the page as edited by that person", async () => {
    const { id } = await newPage();
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "x" }] });
    const before = await prisma.notebookPage.findUniqueOrThrow({ where: { id } });

    const other = await makeUser(Role.DEV_GLOBAL);
    actAs(other);
    await updateNotebookPage({ id, blocks: [{ id: "a", type: "paragraph", text: "x" }], autosave: true });

    const after = await prisma.notebookPage.findUniqueOrThrow({ where: { id } });
    expect(after.updatedByName).toBe(before.updatedByName);
  });
});
