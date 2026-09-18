"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const MIN = 5;
const MAX = 1000;

// Asks for a written reason (cancelling, refusing, reopening). The text is
// kept while the dialog is open and cleared when it closes.
export function ReasonDialog({
  open,
  title,
  description,
  label = "Motivo",
  placeholder = "Explique em poucas palavras",
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  label?: string;
  placeholder?: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const valid = reason.trim().length >= MIN;

  // Whoever closes the dialog (Back, Esc, or the caller after success), the
  // next time it opens the box is empty.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setReason("");
  }

  const close = () => {
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="reason-text">{label}</Label>
          <Textarea
            id="reason-text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={placeholder}
            maxLength={MAX}
            rows={4}
          />
          <span className="text-xs text-muted-foreground">
            Mínimo de {MIN} caracteres.
          </span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Voltar
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!valid || busy}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
