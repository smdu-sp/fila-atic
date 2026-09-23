"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import type { NotebookTreeNode } from "@/actions/notebookActions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Node = NotebookTreeNode & { children: Node[] };

// Nodes arrive already sorted by position (see listNotebookTree); grouping
// by parentId here keeps that order, since Map preserves insertion order.
function buildTree(flat: NotebookTreeNode[]): Node[] {
  const byId = new Map<string, Node>();
  flat.forEach((node) => byId.set(node.id, { ...node, children: [] }));

  const roots: Node[] = [];
  byId.forEach((node) => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  return roots;
}

export function NotebookTree({
  nodes,
  currentPageId,
  onAddChild,
}: {
  nodes: NotebookTreeNode[];
  currentPageId: string | null;
  onAddChild: (parentId: string) => void;
}) {
  const tree = buildTree(nodes);

  if (tree.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-sm text-muted-foreground">
        Nenhuma página ainda.
      </p>
    );
  }

  return (
    <ul className="grid gap-0.5">
      {tree.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          currentPageId={currentPageId}
          onAddChild={onAddChild}
          depth={0}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  currentPageId,
  onAddChild,
  depth,
}: {
  node: Node;
  currentPageId: string | null;
  onAddChild: (parentId: string) => void;
  depth: number;
}) {
  const active = node.id === currentPageId;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pe-1",
          active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
        )}
        style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
      >
        <Link
          href={`/caderno?p=${node.id}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm"
        >
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{node.title}</span>
        </Link>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Nova subpágina em ${node.title}`}
          onClick={() => onAddChild(node.id)}
        >
          <Plus />
        </Button>
      </div>
      {node.children.length ? (
        <ul className="grid gap-0.5">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              currentPageId={currentPageId}
              onAddChild={onAddChild}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
