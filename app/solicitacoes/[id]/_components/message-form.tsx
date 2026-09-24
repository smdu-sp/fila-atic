"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createProjectMessage } from "@/actions/solicitacaoActions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmojiTextarea } from "@/components/emoji-picker";

type MessageFormProps = {
  projectId: string;
  triggerLabel?: string;
  dialogTitle?: string;
  dialogDescription?: string;
  successMessage?: string;
};

export function MessageForm({
  projectId,
  triggerLabel = "Enviar nova mensagem",
  dialogTitle = "Nova mensagem",
  dialogDescription = "Escreva sua mensagem para a equipe.",
  successMessage = "Mensagem enviada. Resposta em ate 24h.",
}: MessageFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = message.trim().length >= 3 || attachments.length > 0;
  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };
  const truncateFileName = (name: string, maxLength = 30) =>
    name.length > maxLength ? `${name.slice(0, maxLength - 3)}...` : name;

  const handleSubmit = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("message", message);
      attachments.forEach((file) => {
        formData.append("attachments", file);
      });

      const result = await createProjectMessage(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(successMessage);
      setMessage("");
      setAttachments([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setOpen(false);
      router.refresh();
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setAttachments(files);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index),
    );
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <EmojiTextarea
            placeholder="Digite sua mensagem"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="grid gap-2">
            <Input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
            />
            {attachments.length ? (
              <div className="grid gap-2">
                {attachments.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-2 py-1 text-xs"
                  >
                    <span className="truncate">
                      {truncateFileName(file.name)} ·{" "}
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => handleRemoveAttachment(index)}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={!canSend || isPending}>
              {isPending ? "Enviando" : "Enviar mensagem"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
