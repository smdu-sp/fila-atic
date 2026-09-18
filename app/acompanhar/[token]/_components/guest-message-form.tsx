"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createGuestMessage } from "@/actions/publicRequestActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
};

export function GuestMessageForm({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = message.trim().length >= 3 || attachments.length > 0;

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setAttachments(Array.from(event.target.files ?? []));
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("token", token);
      formData.set("message", message);
      attachments.forEach((file) => formData.append("attachments", file));

      const result = await createGuestMessage(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success("Mensagem enviada.");
      setMessage("");
      setAttachments([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <div className="grid gap-3">
      <Textarea
        placeholder="Escreva uma mensagem para a equipe"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={5000}
      />
      <div className="grid gap-2">
        <Input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
        />
        <span className="text-xs text-muted-foreground">
          Até 3 arquivos de 10 MB (PDF, imagens e documentos do Office).
        </span>
        {attachments.map((file, index) => (
          <div
            key={`${file.name}-${file.size}-${index}`}
            className="truncate rounded-lg border border-border/60 px-2 py-1 text-xs"
          >
            {file.name} · {formatFileSize(file.size)}
          </div>
        ))}
      </div>
      <Button onClick={handleSubmit} disabled={!canSend || isPending}>
        {isPending ? "Enviando" : "Enviar mensagem"}
      </Button>
    </div>
  );
}
