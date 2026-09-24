"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  CopyIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import {
  BLOCK_TEXT_CLASS,
  InlineText,
  numberingOf,
} from "@/app/wiki/_components/block-view";
import { EmojiButton, insertTextAtCursor } from "@/components/emoji-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MAX_UPLOAD_SIZE } from "@/lib/uploadLimits";
import {
  hasInlineMarkup,
  isTextBlock,
  makeBlock,
  MAX_BLOCK_TEXT,
  newBlockId,
  type Block,
  type BlockType,
} from "@/lib/wikiBlocks";
import {
  applyMarkdownShortcut,
  backspaceAtStart,
  BLOCK_MENU,
  convertBlock,
  duplicateBlock,
  filterBlockMenu,
  moveBlock,
  moveBlockBefore,
  splitBlock,
  type EditResult,
} from "@/lib/wikiEditing";

type UploadedImage = { url: string; name: string };

type Props = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  // Sends the file to the server; null when it failed (the caller already
  // told the user why).
  onUploadImage: (file: File) => Promise<UploadedImage | null>;
};

const PLACEHOLDERS: Partial<Record<BlockType, string>> = {
  paragraph: "Digite '/' para escolher um tipo de bloco",
  heading1: "Título 1",
  heading2: "Título 2",
  heading3: "Título 3",
  bulleted: "Item da lista",
  numbered: "Item da lista",
  todo: "Tarefa",
  quote: "Citação",
  code: "Código",
  callout: "Destaque",
};

// A textarea that grows with its text (field-sizing is not everywhere yet).
function AutoTextarea({
  value,
  registerRef,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "ref"> & {
  registerRef: (element: HTMLTextAreaElement | null) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={(element) => {
        ref.current = element;
        registerRef(element);
      }}
      rows={1}
      value={value}
      maxLength={MAX_BLOCK_TEXT}
      className={cn(
        "block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-muted-foreground/60 placeholder:opacity-0 focus:placeholder:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

export function BlockEditor({ blocks, onChange, onUploadImage }: Props) {
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<EditResult["focus"] | null>(null);
  const lastFocused = useRef<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  // where the next uploaded image goes: after this block (null: at the end)
  const imageAfter = useRef<string | null>(null);
  // always the latest blocks, for code that runs after an await
  const latest = useRef(blocks);

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState<{ id: string; overId: string | null; after: boolean } | null>(null);

  useEffect(() => {
    latest.current = blocks;
  });

  // Put the cursor where the last edit asked for, once the blocks rendered.
  useEffect(() => {
    const request = pendingFocus.current;
    if (!request) return;

    // a block that shows its formatted text has no field until it is focused:
    // keep the request for the render that mounts it
    const element = fields.current.get(request.id);
    if (!element) return;
    pendingFocus.current = null;

    element.focus();
    const at = request.caret === "end" ? element.value.length : request.caret;
    element.setSelectionRange(at, at);
  });

  const numbers = numberingOf(blocks);

  const apply = (result: EditResult) => {
    pendingFocus.current = result.focus;
    setFocusedId(result.focus.id);
    onChange(result.blocks);
  };

  const replace = (id: string, next: Block) =>
    onChange(blocks.map((block) => (block.id === id ? next : block)));

  const setText = (block: Block, text: string) => {
    const typed = { ...block, text };
    const converted = applyMarkdownShortcut(typed);

    if (converted) pendingFocus.current = { id: block.id, caret: 0 };
    setSlashIndex(0);
    setSlashDismissed(null);
    replace(block.id, converted ?? typed);
  };

  const focusNeighbor = (id: string, step: -1 | 1) => {
    let index = blocks.findIndex((block) => block.id === id) + step;

    while (index >= 0 && index < blocks.length && !isTextBlock(blocks[index].type)) {
      index += step;
    }
    const target = blocks[index];
    if (!target) return false;

    pendingFocus.current = { id: target.id, caret: step === -1 ? "end" : 0 };
    // no content change, so ask for a render to run the focus effect
    setFocusedId(target.id);
    return true;
  };

  const chooseType = (block: Block, type: BlockType) => {
    if (type === "image") {
      // the "/" text is the request, not content
      if (block.type === "paragraph" && block.text.startsWith("/")) {
        replace(block.id, { ...block, text: "" });
      }
      pickImage(block.id);
      return;
    }

    const cleared = block.type === "paragraph" && block.text.startsWith("/") ? { ...block, text: "" } : block;
    pendingFocus.current = { id: block.id, caret: "end" };
    replace(block.id, convertBlock(cleared, type));
  };

  const slashEntries = (block: Block) =>
    block.type === "paragraph" && block.text.startsWith("/") && !block.text.includes("\n")
      ? filterBlockMenu(block.text.slice(1))
      : null;

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>, block: Block) => {
    if (event.nativeEvent.isComposing) return;

    const element = event.currentTarget;
    const start = element.selectionStart;
    const end = element.selectionEnd;

    const entries = focusedId === block.id && slashDismissed !== block.text ? slashEntries(block) : null;
    if (entries?.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setSlashIndex((current) => (current + step + entries.length) % entries.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        chooseType(block, entries[Math.min(slashIndex, entries.length - 1)].type);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashDismissed(block.text);
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      if (block.type === "code") {
        // Enter is a new line in code; Ctrl+Enter leaves the block
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          insertParagraphAfter(block.id);
        }
        return;
      }

      event.preventDefault();
      const kept = { ...block, text: block.text.slice(0, start) + block.text.slice(end) };
      const result = splitBlock(
        blocks.map((item) => (item.id === block.id ? kept : item)),
        block.id,
        start,
      );
      if (result) apply(result);
      return;
    }

    if (event.key === "Backspace" && start === 0 && end === 0) {
      const result = backspaceAtStart(blocks, block.id);
      if (result) {
        event.preventDefault();
        apply(result);
      }
      return;
    }

    if (event.key === "ArrowUp" && !event.shiftKey && start === 0 && end === 0) {
      if (focusNeighbor(block.id, -1)) event.preventDefault();
    } else if (
      event.key === "ArrowDown" &&
      !event.shiftKey &&
      start === block.text.length &&
      end === block.text.length
    ) {
      if (focusNeighbor(block.id, 1)) event.preventDefault();
    }
  };

  const insertParagraphAfter = (id: string) => {
    const created = makeBlock();
    const index = blocks.findIndex((block) => block.id === id);
    const next = blocks.slice();
    next.splice(index + 1, 0, created);
    apply({ blocks: next, focus: { id: created.id, caret: 0 } });
  };

  const removeBlock = (id: string) => {
    const index = blocks.findIndex((block) => block.id === id);
    const next = blocks.filter((block) => block.id !== id);
    if (!next.length) next.push(makeBlock());

    const neighbor = next[Math.min(index, next.length - 1)];
    apply({
      blocks: next,
      focus: { id: neighbor.id, caret: "end" },
    });
  };

  // ---- images ------------------------------------------------------------

  const pickImage = (afterId: string | null) => {
    imageAfter.current = afterId;
    imageInput.current?.click();
  };

  const uploadImage = async (file: File | undefined, afterId: string | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Escolha um arquivo de imagem.");
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      toast.error(`Imagem acima de ${MAX_UPLOAD_SIZE / 1024 / 1024} MB.`);
      return;
    }

    setUploading(true);
    const uploaded = await onUploadImage(file);
    setUploading(false);
    if (!uploaded) return;

    const current = latest.current;
    const image: Block = { id: newBlockId(), type: "image", text: "", url: uploaded.url };
    const index = afterId ? current.findIndex((block) => block.id === afterId) : current.length - 1;
    const anchor = current[index];
    const next = current.slice();

    // an empty line the "/" menu was opened on becomes the image
    if (anchor && anchor.type === "paragraph" && !anchor.text.trim()) next.splice(index, 1, image);
    else next.splice(index + 1, 0, image);

    const after = next[next.findIndex((block) => block.id === image.id) + 1];
    if (after && isTextBlock(after.type)) {
      pendingFocus.current = { id: after.id, caret: 0 };
    } else {
      const trailing = makeBlock();
      next.splice(next.findIndex((block) => block.id === image.id) + 1, 0, trailing);
      pendingFocus.current = { id: trailing.id, caret: 0 };
    }
    onChange(next);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>, block: Block) => {
    const file = Array.from(event.clipboardData.files).find((item) => item.type.startsWith("image/"));
    if (!file) return;

    event.preventDefault();
    void uploadImage(file, block.id);
  };

  // ---- drag and drop -----------------------------------------------------

  const startDrag = (event: DragEvent<HTMLElement>, id: string) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "bloco");
    const row = event.currentTarget.closest("[data-block-row]");
    if (row) event.dataTransfer.setDragImage(row, 0, 0);
    setDrag({ id, overId: null, after: false });
  };

  const overRow = (event: DragEvent<HTMLElement>, id: string) => {
    if (!drag) return;
    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    if (drag.overId !== id || drag.after !== after) setDrag({ ...drag, overId: id, after });
  };

  const drop = (event: DragEvent<HTMLElement>) => {
    if (!drag || !drag.overId) return;
    event.preventDefault();

    const overIndex = blocks.findIndex((block) => block.id === drag.overId);
    const beforeId = drag.after ? (blocks[overIndex + 1]?.id ?? null) : drag.overId;
    onChange(moveBlockBefore(blocks, drag.id, beforeId));
    setDrag(null);
  };

  // ---- rows --------------------------------------------------------------

  const registerField = (id: string) => (element: HTMLTextAreaElement | null) => {
    if (element) fields.current.set(id, element);
    else fields.current.delete(id);
  };

  const textarea = (block: Block, className?: string) =>
    focusedId !== block.id && hasInlineMarkup(block.text) ? (
      // not being typed in: show the bold, italic, code and links
      <div
        tabIndex={0}
        role="textbox"
        aria-label={PLACEHOLDERS[block.type] ?? "Bloco de texto"}
        aria-readonly
        onClick={(event) => {
          // a click on a link follows the link; anywhere else starts editing
          if ((event.target as HTMLElement).closest("a")) return;
          startEditing(block.id);
        }}
        onFocus={() => startEditing(block.id)}
        className={cn(
          "min-w-0 cursor-text whitespace-pre-wrap break-words",
          BLOCK_TEXT_CLASS[block.type],
          className,
        )}
      >
        <InlineText text={block.text} />
      </div>
    ) : (
    <AutoTextarea
      value={block.text}
      registerRef={registerField(block.id)}
      placeholder={PLACEHOLDERS[block.type]}
      aria-label={PLACEHOLDERS[block.type] ?? "Bloco de texto"}
      className={cn(BLOCK_TEXT_CLASS[block.type], className)}
      onChange={(event) => setText(block, event.target.value)}
      onKeyDown={(event) => onKeyDown(event, block)}
      onPaste={(event) => onPaste(event, block)}
      onFocus={() => {
        lastFocused.current = block.id;
        setFocusedId(block.id);
      }}
      onBlur={() => setFocusedId((current) => (current === block.id ? null : current))}
    />
    );

  // Swap the formatted text for the field and put the cursor at the end.
  const startEditing = (id: string) => {
    pendingFocus.current = { id, caret: "end" };
    setFocusedId(id);
  };

  const content = (block: Block) => {
    switch (block.type) {
      case "heading1":
      case "heading2":
      case "heading3":
      case "paragraph":
        return textarea(block);
      case "bulleted":
        return (
          <div className="flex gap-2">
            <span aria-hidden className="w-5 shrink-0 text-center leading-7">•</span>
            {textarea(block)}
          </div>
        );
      case "numbered":
        return (
          <div className="flex gap-2">
            <span aria-hidden className="w-5 shrink-0 text-end text-sm leading-7 tabular-nums">
              {numbers.get(block.id)}.
            </span>
            {textarea(block)}
          </div>
        );
      case "todo":
        return (
          <div className="flex gap-2">
            <input
              type="checkbox"
              checked={block.checked === true}
              aria-label="Concluída"
              onChange={() => replace(block.id, { ...block, checked: !block.checked })}
              className="mt-2 size-4 shrink-0 accent-primary"
            />
            {textarea(block, block.checked ? "text-muted-foreground line-through" : undefined)}
          </div>
        );
      case "quote":
        return <div className="border-s-4 border-border ps-4">{textarea(block)}</div>;
      case "code":
        return <div className="rounded-lg bg-muted p-3">{textarea(block, "whitespace-pre")}</div>;
      case "callout":
        return (
          <div className="flex gap-3 rounded-lg bg-muted/70 p-3">
            <EmojiButton
              label="Trocar o ícone"
              className="size-7 shrink-0 text-xl leading-7"
              onPick={(emoji) => replace(block.id, { ...block, icon: emoji })}
            >
              {block.icon}
            </EmojiButton>
            {textarea(block)}
          </div>
        );
      case "divider":
        return <hr className="my-3 border-border" />;
      case "image":
        return (
          <figure className="my-1 grid gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={block.url} alt={block.text} className="max-h-[32rem] max-w-full justify-self-start rounded-lg" />
            <input
              value={block.text}
              placeholder="Legenda (opcional)"
              aria-label="Legenda da imagem"
              maxLength={200}
              onChange={(event) => replace(block.id, { ...block, text: event.target.value })}
              className="w-full border-0 bg-transparent p-0 text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/60 placeholder:opacity-0 focus:placeholder:opacity-100 group-hover/row:placeholder:opacity-100"
            />
          </figure>
        );
    }
  };

  const insertEmoji = (emoji: string) => {
    // the block the cursor was last in, or else the last text block
    const remembered = lastFocused.current ? fields.current.get(lastFocused.current) : undefined;
    const fallback = [...blocks].reverse().find((block) => isTextBlock(block.type));
    const element = remembered ?? (fallback ? fields.current.get(fallback.id) : undefined);
    if (element) {
      insertTextAtCursor(element, emoji);
      return;
    }

    // no field on screen (the block shows its formatted text): append
    const target = blocks.find((block) => block.id === lastFocused.current) ?? fallback;
    if (target) replace(target.id, { ...target, text: target.text + emoji });
  };

  const addBlock = (type: BlockType) => {
    if (type === "image") {
      pickImage(blocks.at(-1)?.id ?? null);
      return;
    }
    const created = makeBlock(type);
    const next = [...blocks, created];
    if (!isTextBlock(type)) next.push(makeBlock());
    apply({ blocks: next, focus: { id: isTextBlock(type) ? created.id : next.at(-1)!.id, caret: 0 } });
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="ghost">
              <PlusIcon />
              Adicionar bloco
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {BLOCK_MENU.map((entry) => (
              <DropdownMenuItem key={entry.type} onSelect={() => addBlock(entry.type)}>
                <span className="grid">
                  <span>{entry.label}</span>
                  <span className="text-xs text-muted-foreground">{entry.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={uploading}
          onClick={() => pickImage(lastFocused.current ?? blocks.at(-1)?.id ?? null)}
        >
          <ImagePlusIcon />
          {uploading ? "Enviando..." : "Imagem"}
        </Button>
        <EmojiButton onPick={insertEmoji} className="size-7" />
        <span className="ms-auto hidden px-2 text-xs text-muted-foreground md:inline">
          Digite &quot;/&quot; para escolher o bloco · **negrito**, *itálico*, `código`
        </span>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void uploadImage(file, imageAfter.current);
          }}
        />
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5" onDragEnd={() => setDrag(null)}>
        {blocks.map((block) => {
          const entries = focusedId === block.id && slashDismissed !== block.text ? slashEntries(block) : null;
          const dropping = drag?.overId === block.id && drag.id !== block.id;

          return (
            <div
              key={block.id}
              data-block-row
              onDragOver={(event) => overRow(event, block.id)}
              onDrop={drop}
              className={cn(
                "group/row relative flex items-start gap-1 rounded-md py-0.5",
                drag?.id === block.id && "opacity-40",
                dropping && !drag.after && "before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-primary",
                dropping && drag.after && "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary",
              )}
            >
              <div className="flex w-12 shrink-0 items-center justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Adicionar bloco abaixo"
                  title="Adicionar bloco abaixo"
                  onClick={() => insertParagraphAfter(block.id)}
                >
                  <PlusIcon />
                </Button>
                <span
                  draggable
                  role="button"
                  tabIndex={-1}
                  aria-label="Arrastar bloco"
                  title="Arrastar para mover"
                  onDragStart={(event) => startDrag(event, block.id)}
                  className="flex size-6 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-accent active:cursor-grabbing"
                >
                  <GripVerticalIcon className="size-4" />
                </span>
              </div>

              <div className="relative min-w-0 flex-1">
                {content(block)}
                {entries ? (
                  <ul
                    role="listbox"
                    aria-label="Tipos de bloco"
                    className="absolute start-0 top-full z-20 mt-1 grid max-h-64 w-64 gap-0.5 overflow-y-auto rounded-lg border border-foreground/10 bg-popover p-1 shadow-md"
                  >
                    {entries.length ? (
                      entries.map((entry, index) => (
                        <li key={entry.type} role="option" aria-selected={index === slashIndex}>
                          <button
                            type="button"
                            // mouse down, not click: the textarea must not blur first
                            onMouseDown={(event) => {
                              event.preventDefault();
                              chooseType(block, entry.type);
                            }}
                            className={cn(
                              "grid w-full rounded-md px-2 py-1 text-start text-sm hover:bg-accent",
                              index === slashIndex && "bg-accent",
                            )}
                          >
                            <span>{entry.label}</span>
                            <span className="text-xs text-muted-foreground">{entry.hint}</span>
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="px-2 py-1 text-sm text-muted-foreground">Nenhum bloco encontrado</li>
                    )}
                  </ul>
                ) : null}
              </div>

              <div className="w-7 shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="icon-xs" variant="ghost" aria-label="Opções do bloco">
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    {isTextBlock(block.type) ? (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>Transformar em</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-56">
                          {BLOCK_MENU.filter((entry) => entry.type !== "image").map((entry) => (
                            <DropdownMenuItem
                              key={entry.type}
                              disabled={entry.type === block.type}
                              onSelect={() => chooseType(block, entry.type)}
                            >
                              {entry.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ) : null}
                    <DropdownMenuItem onSelect={() => onChange(moveBlock(blocks, block.id, -1))}>
                      Mover para cima
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onChange(moveBlock(blocks, block.id, 1))}>
                      Mover para baixo
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        const result = duplicateBlock(blocks, block.id);
                        if (result) apply(result);
                      }}
                    >
                      <CopyIcon />
                      Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => removeBlock(block.id)}>
                      <Trash2Icon />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => insertParagraphAfter(blocks.at(-1)?.id ?? "")}
        className="rounded-md py-1 text-start text-sm text-muted-foreground hover:text-foreground"
      >
        + Clique para adicionar texto no fim
      </button>
    </div>
  );
}
