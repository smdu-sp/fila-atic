import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import {
  addNotebookPageImage,
  createNotebookPage,
  deleteNotebookPage,
  deleteNotebookPageAttachment,
  getNotebookPage,
  listNotebookTree,
  reorderNotebookPage,
  searchNotebookPages,
  updateNotebookPage,
} from "@/actions/notebookActions";
import { GET as downloadUpload } from "@/app/uploads/[name]/route";
import { deleteUploads } from "@/lib/uploads";
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

describe("permissions", () => {
  it("is staff-only: requesters and guests are refused, every staff role is allowed", async () => {
    const requester = await makeUser(Role.REQUESTER);
    const guest = await makeUser(Role.REQUESTER, { isGuest: true });
    const devRestricted = await makeUser(Role.DEV_RESTRICTED);
    const devGlobal = await makeUser(Role.DEV_GLOBAL);
    const coord = await makeUser(Role.COORDINATOR);
    const techLead = await makeUser(Role.TECH_LEAD);

    actAs(requester);
    expect(await listNotebookTree()).toMatchObject({ success: false });
    expect(await createNotebookPage({ title: "x" })).toMatchObject({
      success: false,
    });
    actAs(guest);
    expect(await listNotebookTree()).toMatchObject({ success: false });

    for (const user of [devRestricted, devGlobal, coord, techLead]) {
      actAs(user);
      expect(await listNotebookTree()).toMatchObject({ success: true });
    }
  });
});

describe("pages", () => {
  it("are created, listed in position order and appear with breadcrumbs", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);

    const root = await createNotebookPage({ title: "Servidores" });
    expect(root.success).toBe(true);
    if (!root.success) return;
    const childA = await createNotebookPage({
      title: "Homologação",
      parentId: root.data,
    });
    const childB = await createNotebookPage({
      title: "Produção",
      parentId: root.data,
    });
    expect(childA.success && childB.success).toBe(true);
    if (!childA.success || !childB.success) return;

    const tree = await listNotebookTree();
    expect(
      tree.success &&
        tree.data.filter((n) => n.parentId === root.data).map((n) => n.title),
    ).toEqual(["Homologação", "Produção"]);

    const details = await getNotebookPage(childB.data);
    expect(details.success && details.data.breadcrumbs).toEqual([
      { id: root.data, title: "Servidores" },
      { id: childB.data, title: "Produção" },
    ]);
  });

  it("refuses an empty title, and a missing or invalid parent", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    expect(await createNotebookPage({ title: "   " })).toMatchObject({
      success: false,
    });
    expect(
      await createNotebookPage({ title: "x", parentId: "nao-existe" }),
    ).toMatchObject({ success: false });
  });

  it("logs a revision only when the title or the content actually changes", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    const page = await createNotebookPage({ title: "Runbook" });
    if (!page.success) throw new Error("create failed");

    await updateNotebookPage({ id: page.data, content: "primeira versão" });
    expect(await prisma.notebookPageRevision.count()).toBe(1);

    await updateNotebookPage({ id: page.data, content: "primeira versão" });
    expect(await prisma.notebookPageRevision.count()).toBe(1);

    await updateNotebookPage({ id: page.data, title: "Runbook de deploy" });
    expect(await prisma.notebookPageRevision.count()).toBe(2);

    const details = await getNotebookPage(page.data);
    expect(
      details.success && details.data.revisions.map((r) => r.editedByName),
    ).toEqual([dev.name, dev.name]);
  });

  it("moves between parents, but never into itself or a descendant", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    const a = await createNotebookPage({ title: "A" });
    if (!a.success) throw new Error("create failed");
    const b = await createNotebookPage({ title: "B", parentId: a.data });
    const c = await createNotebookPage({ title: "C" });
    if (!b.success || !c.success) throw new Error("create failed");

    expect(
      await updateNotebookPage({ id: c.data, parentId: b.data }),
    ).toMatchObject({ success: true });
    expect(
      (await prisma.notebookPage.findUniqueOrThrow({ where: { id: c.data } }))
        .parentId,
    ).toBe(b.data);

    expect(
      await updateNotebookPage({ id: a.data, parentId: a.data }),
    ).toMatchObject({ success: false });
    // A -> B -> C now; moving A under C would create a cycle
    expect(
      await updateNotebookPage({ id: a.data, parentId: c.data }),
    ).toMatchObject({ success: false });
  });

  it("reorders siblings, placing a page before another or at the end", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    const a = await createNotebookPage({ title: "A" });
    const b = await createNotebookPage({ title: "B" });
    const c = await createNotebookPage({ title: "C" });
    if (!a.success || !b.success || !c.success)
      throw new Error("create failed");

    const titlesInOrder = async () =>
      (
        await prisma.notebookPage.findMany({
          orderBy: { position: "asc" },
        })
      ).map((p) => p.title);

    expect(await titlesInOrder()).toEqual(["A", "B", "C"]);

    await reorderNotebookPage({ id: c.data, beforeId: a.data });
    expect(await titlesInOrder()).toEqual(["C", "A", "B"]);

    await reorderNotebookPage({ id: c.data, beforeId: null });
    expect(await titlesInOrder()).toEqual(["A", "B", "C"]);
  });

  it("reparents a page (drag onto or between pages of a different parent) in one step", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    const root1 = await createNotebookPage({ title: "Root 1" });
    const root2 = await createNotebookPage({ title: "Root 2" });
    if (!root1.success || !root2.success) throw new Error("create failed");
    const x = await createNotebookPage({ title: "X", parentId: root2.data });
    const y = await createNotebookPage({ title: "Y", parentId: root2.data });
    if (!x.success || !y.success) throw new Error("create failed");

    // drop "into" root1: becomes its child, at the end
    const intoResult = await reorderNotebookPage({
      id: x.data,
      parentId: root1.data,
      beforeId: null,
    });
    expect(intoResult).toMatchObject({ success: true });
    expect(
      (await prisma.notebookPage.findUniqueOrThrow({ where: { id: x.data } }))
        .parentId,
    ).toBe(root1.data);

    // drop "before" y, back under root2: reparents and positions in one call
    const beforeResult = await reorderNotebookPage({
      id: x.data,
      parentId: root2.data,
      beforeId: y.data,
    });
    expect(beforeResult).toMatchObject({ success: true });
    const childrenOfRoot2 = await prisma.notebookPage.findMany({
      where: { parentId: root2.data },
      orderBy: { position: "asc" },
      select: { title: true },
    });
    expect(childrenOfRoot2.map((p) => p.title)).toEqual(["X", "Y"]);

    // and dropping in the tree's own empty space moves it to the root
    const toRoot = await reorderNotebookPage({
      id: x.data,
      parentId: null,
      beforeId: null,
    });
    expect(toRoot).toMatchObject({ success: true });
    expect(
      (await prisma.notebookPage.findUniqueOrThrow({ where: { id: x.data } }))
        .parentId,
    ).toBeNull();
  });

  it("never reparents a page into itself or one of its own descendants", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    const a = await createNotebookPage({ title: "A" });
    if (!a.success) throw new Error("create failed");
    const b = await createNotebookPage({ title: "B", parentId: a.data });
    if (!b.success) throw new Error("create failed");

    expect(
      await reorderNotebookPage({
        id: a.data,
        parentId: a.data,
        beforeId: null,
      }),
    ).toMatchObject({ success: false });
    expect(
      await reorderNotebookPage({
        id: a.data,
        parentId: b.data,
        beforeId: null,
      }),
    ).toMatchObject({ success: false });
  });

  it("deleting a page deletes its whole subtree and every file in it", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    const root = await createNotebookPage({ title: "Root" });
    if (!root.success) throw new Error("create failed");
    const child = await createNotebookPage({
      title: "Child",
      parentId: root.data,
    });
    if (!child.success) throw new Error("create failed");
    const grandchild = await createNotebookPage({
      title: "Grandchild",
      parentId: child.data,
    });
    if (!grandchild.success) throw new Error("create failed");

    const image = new File(["x"], "print.png", { type: "image/png" });
    const form = new FormData();
    form.set("pageId", grandchild.data);
    form.set("image", image);
    await addNotebookPageImage(form);

    await deleteNotebookPage(root.data);

    expect(await prisma.notebookPage.count()).toBe(0);
    expect(vi.mocked(deleteUploads)).toHaveBeenCalledWith([
      "/uploads/fake-print.png",
    ]);
  });
});

describe("images", () => {
  const image = (name = "diagrama.png") =>
    new File(["conteudo"], name, { type: "image/png" });

  it("are uploaded, listed on the page and downloadable only by staff", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    const requester = await makeUser(Role.REQUESTER);
    actAs(dev);
    const page = await createNotebookPage({ title: "Infra" });
    if (!page.success) throw new Error("create failed");

    const form = new FormData();
    form.set("pageId", page.data);
    form.set("image", image());
    const uploaded = await addNotebookPageImage(form);
    expect(uploaded).toMatchObject({
      success: true,
      data: { fileName: "diagrama.png", fileUrl: "/uploads/fake-diagrama.png" },
    });

    const details = await getNotebookPage(page.data);
    expect(details.success && details.data.attachments).toHaveLength(1);

    const get = () =>
      downloadUpload(new Request("http://x/uploads/fake-diagrama.png"), {
        params: Promise.resolve({ name: "fake-diagrama.png" }),
      });
    expect((await get()).status).toBe(200);
    actAs(requester);
    expect((await get()).status).toBe(404);
    actAs(null);
    expect((await get()).status).toBe(401);
  });

  it("can be removed, deleting the file", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    const page = await createNotebookPage({ title: "Infra" });
    if (!page.success) throw new Error("create failed");
    const form = new FormData();
    form.set("pageId", page.data);
    form.set("image", image());
    await addNotebookPageImage(form);
    const [attachment] = await prisma.notebookPageAttachment.findMany();

    expect(await deleteNotebookPageAttachment(attachment.id)).toMatchObject({
      success: true,
    });
    expect(vi.mocked(deleteUploads)).toHaveBeenCalledWith([
      "/uploads/fake-diagrama.png",
    ]);
    expect(await prisma.notebookPageAttachment.count()).toBe(0);
  });
});

describe("search", () => {
  it("finds pages by title, case-insensitively", async () => {
    const dev = await makeUser(Role.DEV_GLOBAL);
    actAs(dev);
    await createNotebookPage({ title: "Servidor de Homologação" });
    await createNotebookPage({ title: "Template de e-mail" });

    const result = await searchNotebookPages("homolog");
    expect(result.success && result.data.map((p) => p.title)).toEqual([
      "Servidor de Homologação",
    ]);

    expect(await searchNotebookPages("")).toMatchObject({
      success: true,
      data: [],
    });
  });
});
