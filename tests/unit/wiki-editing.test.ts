import { describe, expect, it } from "vitest";

import {
  applyMarkdownShortcut,
  backspaceAtStart,
  convertBlock,
  duplicateBlock,
  filterBlockMenu,
  moveBlock,
  moveBlockBefore,
  splitBlock,
  trimTrailingEmpty,
} from "@/lib/wikiEditing";
import type { Block, BlockType } from "@/lib/wikiBlocks";

const block = (id: string, type: BlockType = "paragraph", text = ""): Block => ({ id, type, text });
const texts = (blocks: Block[]) => blocks.map((b) => `${b.type}:${b.text}`);

describe("applyMarkdownShortcut", () => {
  it.each([
    ["# Oi", "heading1", "Oi"],
    ["## Oi", "heading2", "Oi"],
    ["### Oi", "heading3", "Oi"],
    ["- item", "bulleted", "item"],
    ["* item", "bulleted", "item"],
    ["1. passo", "numbered", "passo"],
    ["[] fazer", "todo", "fazer"],
    ["[ ] fazer", "todo", "fazer"],
    ["> citado", "quote", "citado"],
  ])("turns %j into %s", (typed, type, rest) => {
    const result = applyMarkdownShortcut(block("a", "paragraph", typed));
    expect(result).toMatchObject({ id: "a", type, text: rest });
  });

  it("handles --- and ``` typed alone, and ignores everything else", () => {
    expect(applyMarkdownShortcut(block("a", "paragraph", "---"))).toMatchObject({ type: "divider", text: "" });
    expect(applyMarkdownShortcut(block("a", "paragraph", "```"))).toMatchObject({ type: "code" });
    expect(applyMarkdownShortcut(block("a", "paragraph", "#sem espaço"))).toBeNull();
    expect(applyMarkdownShortcut(block("a", "paragraph", "texto normal"))).toBeNull();
    // only plain paragraphs convert: a heading that starts with "- " stays
    expect(applyMarkdownShortcut(block("a", "heading1", "- x"))).toBeNull();
  });
});

describe("filterBlockMenu", () => {
  it("returns everything for an empty query and matches label or keywords, ignoring accents", () => {
    expect(filterBlockMenu("").length).toBeGreaterThan(10);
    expect(filterBlockMenu("titulo").map((e) => e.type)).toEqual(["heading1", "heading2", "heading3"]);
    expect(filterBlockMenu("CITAÇÃO").map((e) => e.type)).toEqual(["quote"]);
    expect(filterBlockMenu("checklist").map((e) => e.type)).toEqual(["todo"]);
    expect(filterBlockMenu("zzzz")).toEqual([]);
  });
});

describe("convertBlock", () => {
  it("keeps the text, adds what the new type needs and clears the divider", () => {
    expect(convertBlock(block("a", "paragraph", "x"), "todo")).toEqual({ id: "a", type: "todo", text: "x", checked: false });
    expect(convertBlock(block("a", "paragraph", "x"), "callout")).toMatchObject({ type: "callout", icon: "💡", text: "x" });
    expect(convertBlock(block("a", "heading1", "x"), "divider")).toEqual({ id: "a", type: "divider", text: "" });
    const same = block("a");
    expect(convertBlock(same, "paragraph")).toBe(same);
  });
});

describe("splitBlock (Enter)", () => {
  it("splits the text at the caret into a new text block", () => {
    const result = splitBlock([block("a", "paragraph", "olá mundo")], "a", 3)!;
    expect(texts(result.blocks)).toEqual(["paragraph:olá", "paragraph: mundo"]);
    expect(result.focus).toEqual({ id: result.blocks[1].id, caret: 0 });
  });

  it("continues lists and to-dos, but headings continue as text", () => {
    expect(texts(splitBlock([block("a", "bulleted", "um")], "a", 2)!.blocks)).toEqual(["bulleted:um", "bulleted:"]);
    expect(texts(splitBlock([block("a", "todo", "um")], "a", 2)!.blocks)).toEqual(["todo:um", "todo:"]);
    expect(texts(splitBlock([block("a", "heading1", "Título")], "a", 6)!.blocks)).toEqual(["heading1:Título", "paragraph:"]);
  });

  it("leaves the list on Enter in an empty item", () => {
    const result = splitBlock([block("a", "bulleted", "")], "a", 0)!;
    expect(texts(result.blocks)).toEqual(["paragraph:"]);
    expect(result.focus).toEqual({ id: "a", caret: 0 });
  });

  it("does nothing on blocks without text", () => {
    expect(splitBlock([block("a", "divider")], "a", 0)).toBeNull();
    expect(splitBlock([block("a")], "zzz", 0)).toBeNull();
  });
});

describe("backspaceAtStart", () => {
  it("first turns a special block into text", () => {
    const result = backspaceAtStart([block("a", "heading1", "x")], "a")!;
    expect(texts(result.blocks)).toEqual(["paragraph:x"]);
  });

  it("joins a paragraph with the text block before it, caret at the seam", () => {
    const result = backspaceAtStart([block("a", "paragraph", "um"), block("b", "paragraph", "dois")], "b")!;
    expect(texts(result.blocks)).toEqual(["paragraph:umdois"]);
    expect(result.focus).toEqual({ id: "a", caret: 2 });
  });

  it("removes an empty line, also after a divider, and does nothing at the top of the page", () => {
    expect(texts(backspaceAtStart([block("a", "paragraph", "um"), block("b")], "b")!.blocks)).toEqual(["paragraph:um"]);
    const afterDivider = backspaceAtStart([block("d", "divider"), block("b")], "b")!;
    expect(texts(afterDivider.blocks)).toEqual(["divider:"]);
    expect(backspaceAtStart([block("d", "divider"), block("b", "paragraph", "texto")], "b")).toBeNull();
    expect(backspaceAtStart([block("a", "paragraph", "x")], "a")).toBeNull();
  });
});

describe("moving blocks", () => {
  const list = [block("a"), block("b"), block("c")];

  it("moves by one place and stays put at the ends", () => {
    expect(moveBlock(list, "b", -1).map((b) => b.id)).toEqual(["b", "a", "c"]);
    expect(moveBlock(list, "b", 1).map((b) => b.id)).toEqual(["a", "c", "b"]);
    expect(moveBlock(list, "a", -1)).toBe(list);
    expect(moveBlock(list, "c", 1)).toBe(list);
  });

  it("drags a block before another, or to the end", () => {
    expect(moveBlockBefore(list, "c", "a").map((b) => b.id)).toEqual(["c", "a", "b"]);
    expect(moveBlockBefore(list, "a", null).map((b) => b.id)).toEqual(["b", "c", "a"]);
    expect(moveBlockBefore(list, "a", "a")).toBe(list);
    expect(moveBlockBefore(list, "a", "nao-existe")).toBe(list);
  });
});

describe("duplicateBlock and trimTrailingEmpty", () => {
  it("duplicates right below with a new id", () => {
    const result = duplicateBlock([block("a", "todo", "x"), block("b")], "a")!;
    expect(texts(result.blocks)).toEqual(["todo:x", "todo:x", "paragraph:"]);
    expect(result.blocks[1].id).not.toBe("a");
  });

  it("drops empty paragraphs from the end only", () => {
    const trimmed = trimTrailingEmpty([block("a", "paragraph", "x"), block("b"), block("c", "paragraph", "y"), block("d"), block("e", "paragraph", "  ")]);
    expect(texts(trimmed)).toEqual(["paragraph:x", "paragraph:", "paragraph:y"]);
    expect(trimTrailingEmpty([block("a")])).toEqual([]);
  });
});
