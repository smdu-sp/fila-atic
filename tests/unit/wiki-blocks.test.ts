import { describe, expect, it } from "vitest";

import {
  blocksToPlainText,
  makeBlock,
  markdownToBlocks,
  normalizeBlocks,
  parseContent,
  parseInline,
  sameBlocks,
  serializeBlocks,
} from "@/lib/wikiBlocks";

const shape = (blocks: ReturnType<typeof markdownToBlocks>) =>
  blocks.map((block) => ({ ...block, id: undefined }));

describe("markdownToBlocks (pages written before blocks)", () => {
  it("converts headings, lists, to-dos, quotes, dividers and paragraphs", () => {
    const blocks = markdownToBlocks(
      [
        "# Título",
        "## Sub",
        "Um parágrafo",
        "em duas linhas",
        "",
        "- item a",
        "* item b",
        "1. primeiro",
        "2) segundo",
        "- [ ] fazer",
        "- [x] feito",
        "> citação",
        "---",
      ].join("\n"),
    );

    expect(shape(blocks)).toEqual([
      { type: "heading1", text: "Título" },
      { type: "heading2", text: "Sub" },
      { type: "paragraph", text: "Um parágrafo\nem duas linhas" },
      { type: "bulleted", text: "item a" },
      { type: "bulleted", text: "item b" },
      { type: "numbered", text: "primeiro" },
      { type: "numbered", text: "segundo" },
      { type: "todo", text: "fazer", checked: false },
      { type: "todo", text: "feito", checked: true },
      { type: "quote", text: "citação" },
      { type: "divider", text: "" },
    ]);
  });

  it("keeps fenced code as one block, blank lines and all", () => {
    const blocks = markdownToBlocks("antes\n```js\nconst a = 1;\n\nconst b = 2;\n```\ndepois");
    expect(shape(blocks)).toEqual([
      { type: "paragraph", text: "antes" },
      { type: "code", text: "const a = 1;\n\nconst b = 2;" },
      { type: "paragraph", text: "depois" },
    ]);
  });

  it("turns uploaded images into image blocks, even in the middle of a line", () => {
    const blocks = markdownToBlocks("veja ![print](/uploads/a-1.png) acima\n\n![](/uploads/b.jpg)");
    expect(shape(blocks)).toEqual([
      { type: "paragraph", text: "veja" },
      { type: "image", text: "print", url: "/uploads/a-1.png" },
      { type: "paragraph", text: "acima" },
      { type: "image", text: "", url: "/uploads/b.jpg" },
    ]);
  });
});

describe("parseContent / serializeBlocks", () => {
  it("returns no blocks for empty content and reads Markdown when it is not JSON", () => {
    expect(parseContent("")).toEqual([]);
    expect(parseContent(null)).toEqual([]);
    expect(shape(parseContent("# Oi"))).toEqual([{ type: "heading1", text: "Oi" }]);
    expect(shape(parseContent("{ chave: 1 }"))).toEqual([{ type: "paragraph", text: "{ chave: 1 }" }]);
  });

  it("round-trips the blocks the editor saves, ids included", () => {
    const blocks = [makeBlock("heading1", "Runbook"), makeBlock("todo", "revisar"), makeBlock("callout", "atenção")];
    expect(parseContent(serializeBlocks(blocks))).toEqual(blocks);
  });

  it("compares blocks ignoring ids", () => {
    const a = [makeBlock("paragraph", "x")];
    const b = [makeBlock("paragraph", "x")];
    expect(sameBlocks(a, b)).toBe(true);
    expect(sameBlocks(a, [makeBlock("paragraph", "y")])).toBe(false);
    expect(sameBlocks(a, [makeBlock("heading1", "x")])).toBe(false);
  });
});

describe("normalizeBlocks", () => {
  it("accepts valid blocks, fills defaults and drops unknown fields", () => {
    const result = normalizeBlocks([
      { id: "a", type: "todo", text: "x", checked: true, lixo: 1 },
      { type: "callout", text: "y" },
      { id: "c", type: "divider", text: "ignorado" },
      { id: "d", type: "image", text: "alt", url: "/uploads/foto-1.png" },
    ]);

    expect(result).toHaveLength(4);
    expect(result![0]).toEqual({ id: "a", type: "todo", text: "x", checked: true });
    expect(result![1]).toMatchObject({ type: "callout", icon: "💡" });
    expect(result![1].id).toBeTruthy();
    expect(result![2]).toEqual({ id: "c", type: "divider", text: "" });
  });

  it("rejects what could hurt: bad types, repeated ids, foreign image urls, huge input", () => {
    expect(normalizeBlocks("nao")).toBeNull();
    expect(normalizeBlocks([null])).toBeNull();
    expect(normalizeBlocks([{ type: "script", text: "" }])).toBeNull();
    expect(normalizeBlocks([{ id: "a", type: "paragraph" }, { id: "a", type: "paragraph" }])).toBeNull();
    expect(normalizeBlocks([{ type: "image", text: "", url: "https://evil.example/x.png" }])).toBeNull();
    expect(normalizeBlocks([{ type: "image", text: "", url: "/uploads/../../etc/passwd" }])).toBeNull();
    expect(normalizeBlocks([{ type: "image", text: "" }])).toBeNull();
    expect(normalizeBlocks([{ type: "paragraph", text: "x".repeat(20001) }])).toBeNull();
    expect(normalizeBlocks(Array.from({ length: 1001 }, () => ({ type: "paragraph", text: "" })))).toBeNull();
  });
});

describe("parseInline", () => {
  it("reads bold, italic, code, links and bare links", () => {
    expect(parseInline("a **b** _c_ `d` [e](https://x.io) https://y.io/z.")).toEqual([
      { type: "text", text: "a " },
      { type: "bold", text: "b" },
      { type: "text", text: " " },
      { type: "italic", text: "c" },
      { type: "text", text: " " },
      { type: "code", text: "d" },
      { type: "text", text: " " },
      { type: "link", text: "e", href: "https://x.io" },
      { type: "text", text: " " },
      { type: "link", text: "https://y.io/z", href: "https://y.io/z" },
      { type: "text", text: "." },
    ]);
  });

  it("never makes a link out of javascript: and similar", () => {
    const nodes = parseInline("[clique](javascript:alert(1)) e [ok](/wiki?p=1)");
    expect(nodes.some((n) => n.type === "link" && n.href.startsWith("javascript"))).toBe(false);
    expect(nodes).toContainEqual({ type: "link", text: "ok", href: "/wiki?p=1" });
  });

  it("leaves snake_case and lone asterisks alone", () => {
    expect(parseInline("nome_da_variavel 2 * 3")).toEqual([{ type: "text", text: "nome_da_variavel 2 * 3" }]);
  });
});

describe("blocksToPlainText", () => {
  it("drops the markup and the non-text blocks", () => {
    const text = blocksToPlainText([
      makeBlock("heading1", "Deploy"),
      makeBlock("paragraph", "veja **isto** e [o guia](https://x.io)"),
      makeBlock("divider"),
    ]);
    expect(text).toBe("Deploy\nveja isto e o guia");
  });
});
