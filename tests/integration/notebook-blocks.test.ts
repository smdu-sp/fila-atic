import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import {
  addNotebookPageImage,
  createNotebookPage,
  getNotebookPage,
  updateNotebookPage,
} from "@/actions/notebookActions";
import { deleteUploads } from "@/lib/uploads";
import { serializeBlocks, type Block } from "@/lib/wikiBlocks";
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
