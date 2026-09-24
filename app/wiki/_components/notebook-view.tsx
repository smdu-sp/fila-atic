"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
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
import { EDIT_CONFLICT_ERROR, trimTrailingEmpty } from "@/lib/wikiEditing";

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
      <aside className="grid grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-xl bg-muted/70 p-2 lg:h-fit lg:sticky lg:top-4">
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

// The page is always editable; changes are saved on their own a moment after
// the last keystroke.
const AUTOSAVE_MS = 1200;

type SaveStatus =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "invalid" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

function SaveIndicator({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  switch (status.kind) {
    case "dirty":
      return <span>Alterações pendentes…</span>;
    case "saving":
      return <span>Salvando…</span>;
    case "saved":
      return (
        <span>
          Salvo às{" "}
          {status.at.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      );
    case "invalid":
      return <span className="text-destructive">Informe o título para salvar.</span>;
    case "error":
      return (
        <span className="text-destructive">
          Não foi possível salvar ({status.message}).{" "}
          <button type="button" className="underline" onClick={onRetry}>
            Tentar de novo
          </button>
        </span>
      );
    default:
      return <span>As alterações são salvas automaticamente.</span>;
  }
}

function PageBody({ page }: { page: NotebookPageDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(page.title);
  // an empty page starts with one empty line to type in
  const [blocks, setBlocks] = useState(() =>
    page.blocks.length ? page.blocks : [makeBlock()],
  );
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [deleteOpen, setDeleteOpen] = useState(false);

  // What the save needs, kept in refs so the timer and the unmount cleanup
  // always see the latest values.
  const latest = useRef({ title: page.title, blocks });
  const version = useRef(page.version);
  const knownTitle = useRef(page.title);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const conflict = useRef(false);
  const overwrite = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<() => Promise<void>>(async () => undefined);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current || inFlight.current || conflict.current) return;

    const current = latest.current;
    if (!current.title.trim()) {
      setStatus({ kind: "invalid" });
      return;
    }

    dirty.current = false;
    inFlight.current = true;
    setStatus({ kind: "saving" });

    const result = await updateNotebookPage({
      id: page.id,
      title: current.title,
      blocks: trimTrailingEmpty(current.blocks),
      expectedVersion: overwrite.current ? undefined : version.current,
      autosave: true,
    });
    inFlight.current = false;

    if (result.success) {
      overwrite.current = false;
      version.current = result.data.version;
      // the page list on the left shows the title
      if (current.title.trim() !== knownTitle.current) {
        knownTitle.current = current.title.trim();
        router.refresh();
      }
      if (dirty.current) {
        // typed more while saving
        timer.current = setTimeout(() => void flushRef.current(), 0);
      } else {
        setStatus({ kind: "saved", at: new Date() });
      }
      return;
    }

    dirty.current = true;
    if (result.error === EDIT_CONFLICT_ERROR) {
      conflict.current = true;
      setStatus({ kind: "conflict" });
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  }, [page.id, router]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const changed = () => {
    dirty.current = true;
    if (conflict.current) return;

    setStatus({ kind: "dirty" });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), AUTOSAVE_MS);
  };

  const onTitleChange = (value: string) => {
    setTitle(value);
    latest.current = { ...latest.current, title: value };
    changed();
  };

  const onBlocksChange = (next: Block[]) => {
    setBlocks(next);
    latest.current = { ...latest.current, blocks: next };
    changed();
  };

  // Leaving the page (another wiki page, another screen) saves what is pending.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current && !conflict.current) void flushRef.current();
    },
    [],
  );

  // Closing the tab with unsaved changes asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const saveOverMine = () => {
    conflict.current = false;
    overwrite.current = true;
    dirty.current = true;
    void flush();
  };

  const retry = () => {
    dirty.current = true;
    void flush();
  };

  const remove = () =>
    startTransition(async () => {
      // nothing to save on a page that is going away
      clearTimeout(timer.current);
      dirty.current = false;

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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
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

      {status.kind === "conflict" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <span>
            Outra pessoa salvou esta página enquanto você editava. Suas
            alterações ainda não foram salvas.
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Recarregar a versão dela
            </Button>
            <Button size="sm" onClick={saveOverMine}>
              Salvar a minha por cima
            </Button>
          </span>
        </div>
      ) : null}

      <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <EmojiInput
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Título da página"
              className="h-auto border-transparent bg-transparent px-0 py-0 text-xl font-semibold shadow-none hover:border-input focus-visible:border-ring md:text-xl"
              aria-label="Título da página"
            />
          </div>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label="Excluir página"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 />
          </Button>
        </div>

        <p className="mt-1 text-xs text-muted-foreground">
          Criada por {page.createdByName} em {formatDateTime(page.createdAt)}
          {page.updatedAt.toString() !== page.createdAt.toString()
            ? ` · Editada por ${page.updatedByName} em ${formatDateTime(page.updatedAt)}`
            : ""}
        </p>
        <p
          className="mt-0.5 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <SaveIndicator status={status} onRetry={retry} />
        </p>

        <div className="mt-4">
          <BlockEditor
            blocks={blocks}
            onChange={onBlocksChange}
            onUploadImage={uploadImage}
          />
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
