"use client";

import type { ReactNode } from "react";

import {
  parseInline,
  type Block,
  type BlockType,
} from "@/lib/wikiBlocks";
import { cn } from "@/lib/utils";

// Classes of each text block, shared by the reader and the editor so a page
// looks the same while it is written and when it is read.
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

export function BlockView({
  blocks,
  onToggleTodo,
}: {
  blocks: Block[];
  // when given, to-do boxes can be ticked right in the page
  onToggleTodo?: (id: string) => void;
}) {
  const numbers = numberingOf(blocks);

  return (
    <div className="grid min-w-0 gap-1">
      {blocks.map((block) => (
        <ViewRow
          key={block.id}
          block={block}
          number={numbers.get(block.id)}
          onToggleTodo={onToggleTodo}
        />
      ))}
    </div>
  );
}

function ViewRow({
  block,
  number,
  onToggleTodo,
}: {
  block: Block;
  number?: number;
  onToggleTodo?: (id: string) => void;
}) {
  const text: ReactNode = block.text ? (
    <InlineText text={block.text} />
  ) : (
    // keeps the height of an empty line
    " "
  );
  const textClass = cn("min-w-0 whitespace-pre-wrap break-words", BLOCK_TEXT_CLASS[block.type]);

  switch (block.type) {
    case "heading1":
      return <h3 className={cn(textClass, "mt-4")}>{text}</h3>;
    case "heading2":
      return <h4 className={cn(textClass, "mt-3")}>{text}</h4>;
    case "heading3":
      return <h5 className={cn(textClass, "mt-2")}>{text}</h5>;
    case "bulleted":
      return (
        <div className="flex gap-2">
          <span aria-hidden className="w-5 shrink-0 text-center leading-7">
            •
          </span>
          <p className={textClass}>{text}</p>
        </div>
      );
    case "numbered":
      return (
        <div className="flex gap-2">
          <span aria-hidden className="w-5 shrink-0 text-end text-sm leading-7 tabular-nums">
            {number}.
          </span>
          <p className={textClass}>{text}</p>
        </div>
      );
    case "todo":
      return (
        <div className="flex gap-2">
          <input
            type="checkbox"
            checked={block.checked === true}
            disabled={!onToggleTodo}
            aria-label="Concluída"
            onChange={() => onToggleTodo?.(block.id)}
            className="mt-2 size-4 shrink-0 accent-primary"
          />
          <p
            className={cn(
              textClass,
              block.checked && "text-muted-foreground line-through",
            )}
          >
            {text}
          </p>
        </div>
      );
    case "quote":
      return (
        <blockquote className="border-s-4 border-border ps-4">
          <p className={textClass}>{text}</p>
        </blockquote>
      );
    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg bg-muted p-3">
          <code className={cn("whitespace-pre", BLOCK_TEXT_CLASS.code)}>
            {block.text || " "}
          </code>
        </pre>
      );
    case "callout":
      return (
        <div className="flex gap-3 rounded-lg bg-muted/70 p-3">
          <span aria-hidden className="text-xl leading-7">
            {block.icon}
          </span>
          <p className={textClass}>{text}</p>
        </div>
      );
    case "divider":
      return <hr className="my-3 border-border" />;
    case "image":
      return (
        <figure className="my-2 grid gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.url}
            alt={block.text}
            className="max-h-[32rem] max-w-full rounded-lg"
          />
          {block.text ? (
            <figcaption className="text-xs text-muted-foreground">
              {block.text}
            </figcaption>
          ) : null}
        </figure>
      );
    default:
      return <p className={textClass}>{text}</p>;
  }
}
