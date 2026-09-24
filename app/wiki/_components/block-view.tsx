"use client";

import { parseInline, type Block, type BlockType } from "@/lib/wikiBlocks";

// Classes of each text block. Blocks that are not being typed in are drawn
// with InlineText inside the same classes, so a page looks the same in the
// text field and out of it.
export const BLOCK_TEXT_CLASS: Record<BlockType, string> = {
  paragraph: "text-sm leading-7",
  heading1: "text-2xl font-semibold leading-9",
  heading2: "text-xl font-semibold leading-8",
  heading3: "text-lg font-semibold leading-7",
  bulleted: "text-sm leading-7",
  numbered: "text-sm leading-7",
  todo: "text-sm leading-7",
  quote: "text-sm italic leading-7 text-muted-foreground",
  code: "font-mono text-sm leading-6",
  callout: "text-sm leading-7",
  divider: "",
  image: "",
};

// "**bold**", "*italic*", "`code`" and links inside a block of text.
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((node, index) => {
        switch (node.type) {
          case "bold":
            return <strong key={index}>{node.text}</strong>;
          case "italic":
            return <em key={index}>{node.text}</em>;
          case "code":
            return (
              <code
                key={index}
                className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
              >
                {node.text}
              </code>
            );
          case "link":
            return (
              <a
                key={index}
                href={node.href}
                target={node.href.startsWith("/") ? undefined : "_blank"}
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                {node.text}
              </a>
            );
          default:
            return <span key={index}>{node.text}</span>;
        }
      })}
    </>
  );
}

// Position of each numbered block inside its run of consecutive numbered ones.
export function numberingOf(blocks: Block[]): Map<string, number> {
  const numbers = new Map<string, number>();
  let run = 0;

  for (const block of blocks) {
    run = block.type === "numbered" ? run + 1 : 0;
    if (block.type === "numbered") numbers.set(block.id, run);
  }

  return numbers;
}
