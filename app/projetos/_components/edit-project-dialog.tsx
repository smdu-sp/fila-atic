"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
} from "@prisma/client";
import { Pencil } from "lucide-react";

import { ProjectUpdateForm } from "@/components/project-update-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Status, priority and delivery forecast of one project, in a dialog that
// closes itself once saved.
export function EditProjectDialog({
  projectId,
  title,
  status,
  priority,
  dueDate,
  category,
}: {
  projectId: string;
  title: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  dueDate: string;
  category: ProjectCategory | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Editar status, prioridade e previsão"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Editar projeto</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {title}
          </DialogDescription>
        </DialogHeader>
        <ProjectUpdateForm
          projectId={projectId}
          defaultStatus={status}
          defaultPriority={priority}
          showDueDate
          defaultDueDate={dueDate}
          showCategory
          defaultCategory={category}
          layout="stack"
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
