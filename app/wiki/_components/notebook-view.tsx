"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  addNotebookPageImage,
  deleteNotebookPage,
  deleteNotebookPageAttachment,
  updateNotebookPage,
  type NotebookPageDetail,
  type NotebookTreeNode,
} from "@/actions/notebookActions";
import { CreatePageDialog } from "@/app/wiki/_components/create-page-dialog";
import { NotebookTree } from "@/app/wiki/_components/notebook-tree";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatFileSize, MAX_UPLOAD_SIZE } from "@/lib/uploadLimits";

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
  const [content, setContent] = useState(page.content);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cancelEdit = () => {
    setTitle(page.title);
    setContent(page.content);
    setEditing(false);
  };

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Informe o título.");
      return;
    }

    startTransition(async () => {
      const result = await updateNotebookPage({
        id: page.id,
        title: trimmed,
        content,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setEditing(false);
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

  const insertImage = (file: File | undefined) => {
    setFileKey((key) => key + 1);
    if (!file) return;

    if (file.size > MAX_UPLOAD_SIZE) {
      toast.error(`Arquivo acima de ${MAX_UPLOAD_SIZE / 1024 / 1024} MB.`);
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("pageId", page.id);
      formData.set("image", file);

      const result = await addNotebookPageImage(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      const embed = `![${result.data.fileName}](${result.data.fileUrl})`;
      const el = textareaRef.current;
      if (el) {
        const start = el.selectionStart ?? content.length;
        const end = el.selectionEnd ?? content.length;
        setContent(content.slice(0, start) + embed + content.slice(end));
      } else {
        setContent((current) => `${current}\n\n${embed}\n`);
      }
      router.refresh();
    });
  };

  const removeAttachment = (attachmentId: string) =>
    startTransition(async () => {
      const result = await deleteNotebookPageAttachment(attachmentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });

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
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="text-lg font-semibold"
              aria-label="Título da página"
            />
          ) : (
            <h2 className="text-xl font-semibold">{page.title}</h2>
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
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
            <div className="grid gap-2">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={16}
                placeholder="Escreva em Markdown: # títulos, listas, **negrito**, links, imagens..."
                className="font-mono text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() =>
                    document
                      .getElementById(`notebook-image-${page.id}`)
                      ?.click()
                  }
                >
                  <ImagePlus />
                  Inserir imagem
                </Button>
                <input
                  key={fileKey}
                  id={`notebook-image-${page.id}`}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(event) => insertImage(event.target.files?.[0])}
                />
              </div>
              {page.attachments.length ? (
                <div className="grid gap-1.5 rounded-lg border border-border/60 p-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Imagens enviadas nesta página
                  </p>
                  <ul className="grid gap-1">
                    {page.attachments.map((attachment) => (
                      <li
                        key={attachment.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <a
                          href={attachment.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate hover:text-primary hover:underline"
                        >
                          {attachment.fileName} ·{" "}
                          {formatFileSize(attachment.fileSize)}
                        </a>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          aria-label={`Remover ${attachment.fileName}`}
                          onClick={() => removeAttachment(attachment.id)}
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : page.content.trim() ? (
            <Markdown content={page.content} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Página vazia.{" "}
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => setEditing(true)}
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
