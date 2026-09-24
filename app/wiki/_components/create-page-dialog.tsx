"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createNotebookPage } from "@/actions/notebookActions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmojiInput } from "@/components/emoji-picker";
import { Label } from "@/components/ui/label";

export function CreatePageDialog({
  open,
  onOpenChange,
  parentId,
  parentTitle,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // null means a page at the root of the wiki.
  parentId: string | null;
  parentTitle: string | null;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Informe o título.");
      return;
    }

    startTransition(async () => {
      const result = await createNotebookPage({ title: trimmed, parentId });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setTitle("");
      onOpenChange(false);
      onCreated(result.data);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Nova página</DialogTitle>
          <DialogDescription>
            {parentTitle
              ? `Criada como subpágina de "${parentTitle}".`
              : "Criada no topo da wiki."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="notebook-page-title">Título</Label>
          <EmojiInput
            id="notebook-page-title"
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Ex.: Servidor de homologação"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? "Criando" : "Criar página"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
