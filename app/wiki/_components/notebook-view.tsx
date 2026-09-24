"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  addNotebookPageImage,
  deleteNotebookPage,
  updateNotebookPage,
  type NotebookPageDetail,
  type NotebookTreeNode,
} from "@/actions/notebookActions";
import { CreatePageDialog } from "@/app/wiki/_components/create-page-dialog";
import { NotebookTree } from "@/app/wiki/_components/notebook-tree";
import { BlockEditor } from "@/app/wiki/_components/block-editor";
import { BlockView } from "@/app/wiki/_components/block-view";
import { EmojiInput } from "@/components/emoji-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { makeBlock, type Block } from "@/lib/wikiBlocks";
import { trimTrailingEmpty } from "@/lib/wikiEditing";

export function NotebookView({
  tree,
  page,
}: {
  tree: NotebookTreeNode[];
  page: NotebookPageDetail | null;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);

  const openCreate = (parentId: string | null) => {
    setCreateParentId(parentId);
    setCreateOpen(true);
  };
  const parentTitle = createParentId
    ? (tree.find((node) => node.id === createParentId)?.title ?? null)
    : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-2 rounded-xl bg-muted/70 p-2 lg:h-fit lg:sticky lg:top-4">
        <Button size="sm" onClick={() => openCreate(null)}>
          <Plus />
          Nova página
        </Button>
        <NotebookTree
          nodes={tree}
          currentPageId={page?.id ?? null}
          onAddChild={openCreate}
        />
      </aside>

      <section className="min-w-0">
        {page ? (
          <PageBody key={page.id} page={page} />
        ) : (
          <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border/60 p-8 text-center">
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">
                {tree.length === 0
                  ? "A wiki está vazia. Crie a primeira página."
                  : "Selecione uma página na lista ao lado."}
              </p>
              {tree.length === 0 ? (
                <Button
                  size="sm"
                  className="justify-self-center"
                  onClick={() => openCreate(null)}
                >
                  <Plus />
                  Nova página
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <CreatePageDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={createParentId}
        parentTitle={parentTitle}
        onCreated={(id) => router.push(`/wiki?p=${id}`)}
      />
    </div>
  );
}

const formatDateTime = (value: Date | string) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

function PageBody({ page }: { page: NotebookPageDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(page.title);
  // what the page shows; the editor works on `draft` until the save
  const [blocks, setBlocks] = useState(page.blocks);
  const [draft, setDraft] = useState<Block[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const startEdit = () => {
    // an empty page starts with one empty line to type in
    setDraft(blocks.length ? blocks : [makeBlock()]);
    setEditing(true);
  };

  const cancelEdit = () => {
    setTitle(page.title);
    setEditing(false);
  };

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Informe o título.");
      return;
    }

    const next = trimTrailingEmpty(draft);

    startTransition(async () => {
      const result = await updateNotebookPage({
        id: page.id,
        title: trimmed,
        blocks: next,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setBlocks(next);
      setEditing(false);
      router.refresh();
    });
  };

  // Ticking a to-do in the reader saves right away, like any other edit.
  const toggleTodo = (id: string) => {
    const previous = blocks;
    const next = blocks.map((block) =>
      block.id === id ? { ...block, checked: !block.checked } : block,
    );
    setBlocks(next);

    startTransition(async () => {
      const result = await updateNotebookPage({ id: page.id, blocks: next });
      if (!result.success) {
        setBlocks(previous);
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  const remove = () =>
    startTransition(async () => {
      const result = await deleteNotebookPage(page.id);
      if (!result.success) {
        toast.error(result.error);
        setDeleteOpen(false);
        return;
      }
      toast.success("Página excluída.");
      router.push("/wiki");
    });

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.set("pageId", page.id);
    formData.set("image", file);

    const result = await addNotebookPageImage(formData);
    if (!result.success) {
      toast.error(result.error);
      return null;
    }
    return { url: result.data.fileUrl, name: result.data.fileName };
  };

  return (
    <div className="grid gap-4">
      {page.breadcrumbs.length > 1 ? (
        <nav
          aria-label="Caminho"
          className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
        >
          {page.breadcrumbs.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {index > 0 ? <span aria-hidden="true">/</span> : null}
              {crumb.id === page.id ? (
                <span>{crumb.title}</span>
              ) : (
                <Link href={`/wiki?p=${crumb.id}`} className="hover:underline">
                  {crumb.title}
                </Link>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {editing ? (
            <div className="min-w-0 flex-1">
              <EmojiInput
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="text-lg font-semibold"
                aria-label="Título da página"
              />
            </div>
          ) : (
            <h2 className="min-w-0 break-words text-xl font-semibold">
              {page.title}
            </h2>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={save} disabled={isPending}>
                  {isPending ? "Salvando" : "Salvar"}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={startEdit}>
                  <Pencil />
                  Editar
                </Button>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Excluir página"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 />
                </Button>
              </>
            )}
          </div>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          Criada por {page.createdByName} em {formatDateTime(page.createdAt)}
          {page.updatedAt.toString() !== page.createdAt.toString()
            ? ` · Editada por ${page.updatedByName} em ${formatDateTime(page.updatedAt)}`
            : ""}
        </p>

        <div className="mt-4">
          {editing ? (
            <BlockEditor
              blocks={draft}
              onChange={setDraft}
              onUploadImage={uploadImage}
            />
          ) : blocks.length ? (
            <BlockView blocks={blocks} onToggleTodo={toggleTodo} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Página vazia.{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={startEdit}
              >
                Escrever agora
              </button>
              .
            </p>
          )}
        </div>
      </div>

      {page.revisions.length ? (
        <details className="rounded-xl border border-border/60 p-3 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">
            Histórico de edições ({page.revisions.length})
          </summary>
          <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
            {page.revisions.map((revision) => (
              <li key={revision.id}>
                {revision.editedByName} · {formatDateTime(revision.editedAt)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Excluir página</DialogTitle>
            <DialogDescription>
              Isso apaga &quot;{page.title}&quot; e todas as suas subpáginas,
              sem volta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={remove} disabled={isPending}>
              {isPending ? "Excluindo" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
