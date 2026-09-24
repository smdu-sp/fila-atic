// The wiki page format: a list of blocks (paragraph, headings, lists, to-do,
// quote, code, callout, divider, image), stored as JSON in
// NotebookPage.content. Pages written before blocks existed hold Markdown;
// parseContent converts them on read, so nothing needs a data migration.
// Pure, so the editor, the actions and the tests agree.

export const BLOCK_TYPES = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulleted",
  "numbered",
  "todo",
  "quote",
  "code",
  "callout",
  "divider",
  "image",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

export type Block = {
  id: string;
  type: BlockType;
  // markup for text blocks (see parseInline); alt text for images
  text: string;
  // todo only
  checked?: boolean;
  // image only: "/uploads/<stored name>"
  url?: string;
  // callout only: the emoji on the left
  icon?: string;
};

export const MAX_BLOCKS = 1000;
export const MAX_BLOCK_TEXT = 20000;
export const DEFAULT_CALLOUT_ICON = "💡";

const UPLOAD_URL = /^\/uploads\/[\w.\-]+$/;
const TEXT_TYPES: BlockType[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bulleted",
  "numbered",
  "todo",
  "quote",
  "code",
  "callout",
];

export const isTextBlock = (type: BlockType) => TEXT_TYPES.includes(type);

// crypto.randomUUID only exists in secure contexts (https or localhost), and
// this app may be served over plain http inside the network.
export const newBlockId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function makeBlock(type: BlockType = "paragraph", text = ""): Block {
  return {
    id: newBlockId(),
    type,
    text,
    ...(type === "todo" ? { checked: false } : {}),
    ...(type === "callout" ? { icon: DEFAULT_CALLOUT_ICON } : {}),
  };
}

// Validates untrusted input (what the editor sends) and returns clean blocks,
// or null when anything is off. Unknown fields are dropped.
export function normalizeBlocks(input: unknown): Block[] | null {
  if (!Array.isArray(input) || input.length > MAX_BLOCKS) return null;

  const blocks: Block[] = [];
  const ids = new Set<string>();

  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;

    const type = item.type;
    if (!BLOCK_TYPES.includes(type as BlockType)) return null;
    const blockType = type as BlockType;

    const id = typeof item.id === "string" && item.id.length <= 64 && item.id ? item.id : newBlockId();
    if (ids.has(id)) return null;
    ids.add(id);

    const text = item.text === undefined ? "" : item.text;
    if (typeof text !== "string" || text.length > MAX_BLOCK_TEXT) return null;

    const block: Block = { id, type: blockType, text: blockType === "divider" ? "" : text };

    if (blockType === "todo") block.checked = item.checked === true;
    if (blockType === "callout") {
      const icon = item.icon;
      if (icon !== undefined && (typeof icon !== "string" || icon.length > 16)) return null;
      block.icon = icon || DEFAULT_CALLOUT_ICON;
    }
    if (blockType === "image") {
      if (typeof item.url !== "string" || !UPLOAD_URL.test(item.url)) return null;
      block.url = item.url;
    }

    blocks.push(block);
  }

  return blocks;
}

export const serializeBlocks = (blocks: Block[]) =>
  JSON.stringify({ v: 2, blocks });

// Same content, ignoring the ids (legacy pages get fresh ids on every read).
export function sameBlocks(a: Block[], b: Block[]): boolean {
  const strip = (blocks: Block[]) =>
    JSON.stringify(blocks.map((block) => ({ ...block, id: undefined })));
  return strip(a) === strip(b);
}

// Whatever is stored in NotebookPage.content -> blocks. JSON written by the
// editor is used as is (validated); anything else is Markdown from before.
export function parseContent(raw: string | null | undefined): Block[] {
  const text = (raw ?? "").trim();
  if (!text) return [];

  if (text.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object" && (parsed as { v?: unknown }).v === 2) {
        const blocks = normalizeBlocks((parsed as { blocks?: unknown }).blocks);
        if (blocks) return blocks;
      }
    } catch {
      // not JSON after all: it is a page that starts with "{"
    }
  }

  return markdownToBlocks(text);
}

const IMAGE = /!\[([^\]]*)\]\((\/uploads\/[\w.\-]+)\)/g;

// The subset of Markdown the old wiki was written in.
export function markdownToBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    pushWithImages(paragraph.join("\n"));
    paragraph = [];
  };

  // "text ![a](/uploads/x) more" -> paragraph, image, paragraph
  const pushWithImages = (text: string) => {
    let last = 0;
    for (const match of text.matchAll(IMAGE)) {
      const before = text.slice(last, match.index).trim();
      if (before) blocks.push(makeBlock("paragraph", before));
      blocks.push({ id: newBlockId(), type: "image", text: match[1], url: match[2] });
      last = (match.index ?? 0) + match[0].length;
    }
    const rest = text.slice(last).trim();
    if (rest) blocks.push(makeBlock("paragraph", rest));
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = /^```(.*)$/.exec(line);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      flushParagraph();
      blocks.push(makeBlock("code", code.join("\n")));
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    let match: RegExpExecArray | null;
    if ((match = /^(#{1,3})\s+(.*)$/.exec(line))) {
      flushParagraph();
      blocks.push(makeBlock(`heading${match[1].length}` as BlockType, match[2].trim()));
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      blocks.push(makeBlock("divider"));
    } else if ((match = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line))) {
      flushParagraph();
      const todo = makeBlock("todo", match[2]);
      todo.checked = match[1].toLowerCase() === "x";
      blocks.push(todo);
    } else if ((match = /^\s*[-*+]\s+(.*)$/.exec(line))) {
      flushParagraph();
      blocks.push(makeBlock("bulleted", match[1]));
    } else if ((match = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      flushParagraph();
      blocks.push(makeBlock("numbered", match[1]));
    } else if ((match = /^>\s?(.*)$/.exec(line))) {
      flushParagraph();
      blocks.push(makeBlock("quote", match[1]));
    } else {
      paragraph.push(line.trimEnd());
    }
  }
  flushParagraph();

  return blocks;
}

// Text of the page without any markup, for search and previews.
export function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .filter((block) => isTextBlock(block.type) && block.text.trim())
    .map((block) =>
      block.text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/(\*\*|__|`|\*)/g, ""),
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Inline formatting inside a block: **bold**, *italic*, `code`, [text](url)
// and bare links. Deliberately small; nesting is not supported.

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "code"; text: string }
  | { type: "link"; text: string; href: string };

// Only links that cannot run script.
export const isSafeHref = (href: string) =>
  /^(https?:\/\/|mailto:|\/(?!\/))/i.test(href.trim());

const INLINE =
  /`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|(?<![\w])_([^_\n]+)_(?![\w])|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)"'])/g;

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let last = 0;

  const pushText = (value: string) => {
    if (value) nodes.push({ type: "text", text: value });
  };

  for (const match of text.matchAll(INLINE)) {
    pushText(text.slice(last, match.index));
    last = (match.index ?? 0) + match[0].length;

    const [, code, boldStar, boldUnder, italicStar, italicUnder, linkText, linkHref, bare] = match;

    if (code !== undefined) nodes.push({ type: "code", text: code });
    else if (boldStar !== undefined || boldUnder !== undefined) {
      nodes.push({ type: "bold", text: (boldStar ?? boldUnder) as string });
    } else if (italicStar !== undefined || italicUnder !== undefined) {
      nodes.push({ type: "italic", text: (italicStar ?? italicUnder) as string });
    } else if (linkText !== undefined && linkHref !== undefined) {
      if (isSafeHref(linkHref)) nodes.push({ type: "link", text: linkText, href: linkHref });
      else pushText(match[0]);
    } else if (bare !== undefined) {
      nodes.push({ type: "link", text: bare, href: bare });
    }
  }

  pushText(text.slice(last));
  return nodes;
}
