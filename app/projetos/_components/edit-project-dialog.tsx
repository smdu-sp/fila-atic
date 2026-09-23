"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
} from "@prisma/client";
import { Pencil } from "lucide-react";

import { getProjectDetails } from "@/actions/solicitacaoActions";
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
import { formatProjectCode } from "@/lib/projectCode";

// Title, description, status, priority, category and delivery forecast of
// one project, in a dialog that closes itself once saved. Title/description
// are fetched fresh when the dialog opens (the row that triggers it does not
// carry the full description).
export function EditProjectDialog({
  projectId,
  code,
  title,
  status,
  priority,
  dueDate,
  category,
}: {
  projectId: string;
  code: number;
  title: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  dueDate: string;
  category: ProjectCategory | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // This component never unmounts between opens (it lives in the list row),
  // so freshness on reopen is handled here, not in the effect below: adjust
  // state during render when "open" flips, instead of resetting inside a
  // useEffect body (see ListFilters for the same pattern).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDescription(null);
      setLoadError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    getProjectDetails(projectId).then((result) => {
      if (cancelled) return;
      if (result.success) setDescription(result.data.description);
      else setLoadError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="outline" aria-label="Editar projeto">
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Editar projeto</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {formatProjectCode(code)} · {title}
          </DialogDescription>
        </DialogHeader>
        {loadError ? (
          <p className="text-sm text-destructive" role="alert">
            {loadError}
          </p>
        ) : description === null ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <ProjectUpdateForm
            key={description}
            projectId={projectId}
            defaultStatus={status}
            defaultPriority={priority}
            showDueDate
            defaultDueDate={dueDate}
            showCategory
            defaultCategory={category}
            showTitleDescription
            defaultTitle={title}
            defaultDescription={description}
            layout="stack"
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
