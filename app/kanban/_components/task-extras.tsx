"use client";

import { useRef, useState } from "react";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { UserAvatar } from "@/app/kanban/_components/board-ui";
import { Button } from "@/components/ui/button";
import { EmojiTextarea } from "@/components/emoji-picker";
import { MAX_COMMENT_LENGTH } from "@/lib/taskFields";
import { formatFileSize, validateUploadFiles } from "@/lib/uploadLimits";

// Attachments and comments of a task, as shown in both the edit dialog (where
// they are saved right away) and the create dialog (where they wait for the
// task to exist). The sections only draw rows and report clicks; what happens
// to the data is up to the dialog.

export type AttachmentRow = {
  key: string;
  name: string;
  size: number;
  // absent while the file is still only on this screen
  href?: string;
  removable: boolean;
};

export type CommentRow = {
  key: string;
  authorName: string;
  // already formatted ("12/05/26 10:30")
  when: string;
  message: string;
  removable: boolean;
};

export function AttachmentsSection({
  rows,
  loading = false,
  error,
  disabled = false,
  onPick,
  onRemove,
}: {
  rows: AttachmentRow[];
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
  onPick: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  // A new key remounts the input, so choosing the same file again works.
  const [fileKey, setFileKey] = useState(0);

  const pick = (files: File[]) => {
    setFileKey((key) => key + 1);
    if (!files.length) return;

    const problem = validateUploadFiles(files);
    if (problem) {
      toast.error(problem);
      return;
    }
    onPick(files);
  };

  return (
    <section className="grid min-w-0 gap-2" aria-label="Anexos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">
          Anexos{rows.length ? ` (${rows.length})` : ""}
        </h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip />
          Anexar arquivo
        </Button>
        <input
          key={fileKey}
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(event) => pick(Array.from(event.target.files ?? []))}
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : rows.length ? (
        <ul className="grid min-w-0 gap-1.5">
          {rows.map((row) => {
            const content = (
              <>
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{row.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatFileSize(row.size)}
                </span>
              </>
            );

            return (
              <li
                key={row.key}
                className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-1.5 text-sm"
              >
                {row.href ? (
                  <a
                    href={row.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 hover:text-primary hover:underline"
                  >
                    {content}
                  </a>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">
                    {content}
                  </span>
                )}
                {row.removable ? (
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled}
                    aria-label={`Remover anexo ${row.name}`}
                    onClick={() => onRemove(row.key)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum anexo.</p>
      )}
    </section>
  );
}

export function CommentsSection({
  rows,
  loaded = true,
  disabled = false,
  draft,
  onDraftChange,
  onSend,
  onRemove,
}: {
  rows: CommentRow[];
  // false while the list is still being fetched
  loaded?: boolean;
  disabled?: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <section className="grid min-w-0 gap-3" aria-label="Comentários">
      <h4 className="text-sm font-medium">
        Comentários{rows.length ? ` (${rows.length})` : ""}
      </h4>
      {rows.length ? (
        <ul className="grid gap-3">
          {rows.map((row) => (
            <li key={row.key} className="flex gap-2.5">
              <UserAvatar name={row.authorName} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span className="text-sm font-medium text-foreground">
                    {row.authorName}
                  </span>
                  {row.when}
                  {row.removable ? (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onRemove(row.key)}
                      className="hover:text-destructive hover:underline"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {row.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        <p className="text-sm text-muted-foreground">
          Nenhum comentário ainda.
        </p>
      ) : null}
      <div className="grid gap-2">
        <EmojiTextarea
          aria-label="Novo comentário"
          value={draft}
          rows={2}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder="Escreva um comentário (Ctrl+Enter envia)"
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="justify-self-end"
          disabled={disabled || !draft.trim()}
          onClick={onSend}
        >
          Comentar
        </Button>
      </div>
    </section>
  );
}
