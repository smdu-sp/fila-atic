"use client";

import { useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  reorderNotebookPage,
  type NotebookTreeNode,
} from "@/actions/notebookActions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Node = NotebookTreeNode & { children: Node[] };
// Where a dragged page lands relative to the row the pointer is over: as its
// sibling right before/after it, or reparented as its child.
type Zone = "before" | "into" | "after";
type DropTarget = { id: string; zone: Zone };

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
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const tree = buildTree(nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const handleDragOver =
    (targetId: string) => (event: DragEvent<HTMLDivElement>) => {
      if (!draggingId || draggingId === targetId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / rect.height;
      const zone: Zone =
        ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "into";

      if (dropTarget?.id !== targetId || dropTarget.zone !== zone) {
        setDropTarget({ id: targetId, zone });
      }
    };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const id = draggingId;
    const target = dropTarget;
    setDraggingId(null);
    setDropTarget(null);
    if (!id || !target || id === target.id) return;

    const targetNode = byId.get(target.id);
    if (!targetNode) return;

    // "into" a page makes it that page's last child; "before"/"after" make
    // it a sibling of the target, right next to it (possibly under a
    // different parent than the one it had).
    const parentId = target.zone === "into" ? target.id : targetNode.parentId;
    const siblingsOfTarget = nodes
      .filter((n) => n.parentId === targetNode.parentId)
      .sort((a, b) => a.position - b.position);
    const targetIndex = siblingsOfTarget.findIndex((n) => n.id === target.id);
    const beforeId =
      target.zone === "before"
        ? target.id
        : target.zone === "after"
          ? (siblingsOfTarget[targetIndex + 1]?.id ?? null)
          : null; // "into": always at the end of the new parent's children

    startTransition(async () => {
      const result = await reorderNotebookPage({ id, parentId, beforeId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  if (tree.length === 0) {
    return (
      <p className="px-2 py-6 text-center text-sm text-muted-foreground">
        Nenhuma página ainda.
      </p>
    );
  }

  return (
    <ul
      className="grid grid-cols-[minmax(0,1fr)] gap-0.5"
      onDragOver={(event) => {
        // Empty space below the last item: move to the root, at the end.
        if (draggingId) event.preventDefault();
      }}
      onDrop={(event) => {
        if (dropTarget) return; // a row already claimed this drop
        event.preventDefault();
        const id = draggingId;
        setDraggingId(null);
        setDropTarget(null);
        if (!id) return;
        startTransition(async () => {
          const result = await reorderNotebookPage({
            id,
            parentId: null,
            beforeId: null,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      {tree.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          currentPageId={currentPageId}
          onAddChild={onAddChild}
          depth={0}
          draggingId={draggingId}
          dropTarget={dropTarget}
          onDragStart={setDraggingId}
          onDragEnd={() => {
            setDraggingId(null);
            setDropTarget(null);
          }}
          onDragOverRow={handleDragOver}
          onDrop={handleDrop}
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
  draggingId,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDrop,
}: {
  node: Node;
  currentPageId: string | null;
  onAddChild: (parentId: string) => void;
  depth: number;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverRow: (
    targetId: string,
  ) => (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent) => void;
}) {
  const active = node.id === currentPageId;
  const isDropTarget = dropTarget?.id === node.id;

  return (
    <li>
      <div
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", node.id);
          onDragStart(node.id);
        }}
        onDragEnd={onDragEnd}
        onDragOver={onDragOverRow(node.id)}
        onDrop={onDrop}
        className={cn(
          "group relative flex items-center gap-1 rounded-md pe-1",
          draggingId === node.id
            ? "opacity-40"
            : active
              ? "bg-accent text-accent-foreground"
              : "hover:bg-accent/60",
          isDropTarget &&
            dropTarget?.zone === "into" &&
            "bg-primary/10 ring-1 ring-inset ring-primary/40",
        )}
        style={{ paddingInlineStart: `${depth * 14 + 8}px` }}
      >
        {isDropTarget && dropTarget?.zone === "before" ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-1 top-0 h-0.5 -translate-y-px rounded-full bg-primary"
          />
        ) : null}
        <Link
          href={`/wiki?p=${node.id}`}
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
        {isDropTarget && dropTarget?.zone === "after" ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-1 bottom-0 h-0.5 translate-y-px rounded-full bg-primary"
          />
        ) : null}
      </div>
      {node.children.length ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              currentPageId={currentPageId}
              onAddChild={onAddChild}
              depth={depth + 1}
              draggingId={draggingId}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverRow={onDragOverRow}
              onDrop={onDrop}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
