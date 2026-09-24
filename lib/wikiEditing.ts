// Editing operations of the wiki block editor, kept pure (blocks in, blocks
// out) so the keyboard behavior can be tested without a browser.

import {
  DEFAULT_CALLOUT_ICON,
  isTextBlock,
  makeBlock,
  newBlockId,
  type Block,
  type BlockType,
} from "@/lib/wikiBlocks";

export type BlockMenuEntry = {
  type: BlockType;
  label: string;
  hint: string;
  // extra words the "/" search matches (Portuguese and the Markdown habit)
  keywords: string;
};

// Order of the "/" menu and of the "turn into" menu.
export const BLOCK_MENU: BlockMenuEntry[] = [
  { type: "paragraph", label: "Texto", hint: "Parágrafo simples", keywords: "texto paragrafo p" },
  { type: "heading1", label: "Título 1", hint: "Seção grande", keywords: "titulo heading h1 #" },
  { type: "heading2", label: "Título 2", hint: "Seção média", keywords: "titulo subtitulo heading h2 ##" },
  { type: "heading3", label: "Título 3", hint: "Seção pequena", keywords: "titulo heading h3 ###" },
  { type: "bulleted", label: "Lista com marcadores", hint: "Itens soltos", keywords: "lista marcadores bullet topicos -" },
  { type: "numbered", label: "Lista numerada", hint: "Passo a passo", keywords: "lista numerada numeros 1." },
  { type: "todo", label: "Lista de tarefas", hint: "Caixas de marcar", keywords: "tarefa todo checkbox checklist []" },
  { type: "quote", label: "Citação", hint: "Trecho em destaque", keywords: "citacao quote >" },
  { type: "callout", label: "Destaque", hint: "Caixa com ícone", keywords: "destaque callout aviso nota" },
  { type: "code", label: "Código", hint: "Texto em fonte monoespaçada", keywords: "codigo code ```" },
  { type: "divider", label: "Divisor", hint: "Linha horizontal", keywords: "divisor linha separador ---" },
  { type: "image", label: "Imagem", hint: "Enviar uma imagem", keywords: "imagem foto figura print" },
];

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// Entries matching what was typed after "/" (all of them for an empty query).
export function filterBlockMenu(query: string): BlockMenuEntry[] {
  const text = normalize(query.trim());
  if (!text) return BLOCK_MENU;

  return BLOCK_MENU.filter((entry) =>
    normalize(`${entry.label} ${entry.keywords}`).includes(text),
  );
}

// Same text in a block of another type. Types without text lose it.
export function convertBlock(block: Block, type: BlockType): Block {
  if (type === block.type) return block;

  const next: Block = {
    id: block.id,
    type,
    text: type === "divider" ? "" : block.text,
  };
  if (type === "todo") next.checked = false;
  if (type === "callout") next.icon = block.icon ?? DEFAULT_CALLOUT_ICON;
  if (block.url && type === "image") next.url = block.url;

  return next;
}

const SHORTCUTS: Array<[RegExp, BlockType]> = [
  [/^### /, "heading3"],
  [/^## /, "heading2"],
  [/^# /, "heading1"],
  [/^[-*+] /, "bulleted"],
  [/^\d+[.)] /, "numbered"],
  [/^\[ ?\] /, "todo"],
  [/^> /, "quote"],
];

// Typing "# ", "- ", "1. ", "[] " or "> " at the start of a plain paragraph
// turns it into that block. Null when nothing applies.
export function applyMarkdownShortcut(block: Block): Block | null {
  if (block.type !== "paragraph") return null;

  if (block.text === "---") {
    return { id: block.id, type: "divider", text: "" };
  }
  if (block.text === "```") {
    return { id: block.id, type: "code", text: "" };
  }

  for (const [pattern, type] of SHORTCUTS) {
    const match = pattern.exec(block.text);
    if (match) {
      return convertBlock({ ...block, text: block.text.slice(match[0].length) }, type);
    }
  }

  return null;
}

// While one of these is empty, Enter (or Backspace) turns it back into text
// instead of creating another one.
const CONTINUING: BlockType[] = ["bulleted", "numbered", "todo"];

export type EditResult = {
  blocks: Block[];
  // block to put the cursor in, and where
  focus: { id: string; caret: number | "end" };
};

const indexOf = (blocks: Block[], id: string) =>
  blocks.findIndex((block) => block.id === id);

// Enter at `caret` of a text block. Lists and to-dos continue with the same
// type; anything else continues as text. Enter on an empty list item leaves
// the list. The text after the caret moves to the new block.
export function splitBlock(blocks: Block[], id: string, caret: number): EditResult | null {
  const index = indexOf(blocks, id);
  const block = blocks[index];
  if (!block || !isTextBlock(block.type)) return null;

  if (CONTINUING.includes(block.type) && !block.text) {
    const plain = convertBlock(block, "paragraph");
    return {
      blocks: blocks.map((item) => (item.id === id ? plain : item)),
      focus: { id, caret: 0 },
    };
  }

  const before = block.text.slice(0, caret);
  const after = block.text.slice(caret);
  const nextType: BlockType = CONTINUING.includes(block.type) ? block.type : "paragraph";
  const created = makeBlock(nextType, after);
  created.id = newBlockId();

  const updated = blocks.slice();
  updated[index] = { ...block, text: before };
  updated.splice(index + 1, 0, created);

  return { blocks: updated, focus: { id: created.id, caret: 0 } };
}

// Backspace at the very start of a block: first it becomes text; then, if it
// is empty, it disappears; otherwise it joins the text block before it.
export function backspaceAtStart(blocks: Block[], id: string): EditResult | null {
  const index = indexOf(blocks, id);
  const block = blocks[index];
  if (!block) return null;

  if (block.type !== "paragraph") {
    const plain = convertBlock(block, "paragraph");
    return {
      blocks: blocks.map((item) => (item.id === id ? plain : item)),
      focus: { id, caret: 0 },
    };
  }

  const previous = blocks[index - 1];
  if (!previous) return null;

  if (!isTextBlock(previous.type)) {
    // a divider or an image before an empty line: remove the empty line
    if (!block.text) {
      return {
        blocks: blocks.filter((item) => item.id !== id),
        focus: { id: previous.id, caret: "end" },
      };
    }
    return null;
  }

  const caret = previous.text.length;
  const merged = { ...previous, text: previous.text + block.text };

  return {
    blocks: blocks.filter((item) => item.id !== id).map((item) => (item.id === previous.id ? merged : item)),
    focus: { id: previous.id, caret },
  };
}

// Moves a block `delta` places (negative goes up); stays put at the ends.
export function moveBlock(blocks: Block[], id: string, delta: number): Block[] {
  const from = indexOf(blocks, id);
  const to = Math.min(Math.max(from + delta, 0), blocks.length - 1);
  if (from < 0 || from === to) return blocks;

  const next = blocks.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Drag and drop: `id` goes right before `beforeId` (null: to the end).
export function moveBlockBefore(blocks: Block[], id: string, beforeId: string | null): Block[] {
  if (id === beforeId) return blocks;

  const moved = blocks.find((block) => block.id === id);
  if (!moved) return blocks;

  const rest = blocks.filter((block) => block.id !== id);
  const at = beforeId === null ? rest.length : rest.findIndex((block) => block.id === beforeId);
  if (at < 0) return blocks;

  rest.splice(at, 0, moved);
  return rest;
}

// A copy right below the original.
export function duplicateBlock(blocks: Block[], id: string): EditResult | null {
  const index = indexOf(blocks, id);
  if (index < 0) return null;

  const copy = { ...blocks[index], id: newBlockId() };
  const next = blocks.slice();
  next.splice(index + 1, 0, copy);
  return { blocks: next, focus: { id: copy.id, caret: "end" } };
}

// Empty text blocks at the end are just leftover from typing.
export function trimTrailingEmpty(blocks: Block[]): Block[] {
  let end = blocks.length;
  while (end > 0 && blocks[end - 1].type === "paragraph" && !blocks[end - 1].text.trim()) {
    end--;
  }
  return blocks.slice(0, end);
}
