"use client";

import { CheckIcon, CopyIcon, GitBranchIcon, GitCommitIcon, GitPullRequestIcon, RocketIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { TaskGithubActivityItem } from "@/actions/taskDetailActions";
import { Button } from "@/components/ui/button";
import { getTaskStatusLabel } from "@/lib/projectLabels";
import { suggestBranchName } from "@/lib/taskCode";

const KIND_ICON = {
  commit: GitCommitIcon,
  pull_request: GitPullRequestIcon,
  deploy: RocketIcon,
} as const;

const formatWhen = (value: Date | string) =>
  new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard needs https or localhost; show the text to copy by hand
      toast.message(text);
    }
  };

  return (
    <Button type="button" size="sm" variant="outline" onClick={copy}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      {label}
    </Button>
  );
}

// The task code to cite in commits, a branch name that carries it, and what
// GitHub already reported about the task.
export function GithubActivitySection({
  code,
  title,
  activity,
}: {
  code: string;
  title: string;
  activity: TaskGithubActivityItem[];
}) {
  return (
    <section className="grid min-w-0 gap-2" aria-label="GitHub">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">GitHub</h4>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={code} label="Copiar código" />
          <CopyButton text={suggestBranchName(code, title)} label="Copiar nome da branch" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Cite <span className="font-mono">{code}</span> na mensagem do commit, no título do pull
        request ou no nome da branch para a tarefa acompanhar o trabalho.
      </p>
      {activity.length ? (
        <ul className="grid min-w-0 gap-1.5">
          {activity.map((item) => {
            const Icon = KIND_ICON[item.kind as keyof typeof KIND_ICON] ?? GitBranchIcon;
            const text = (
              <>
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{item.title}</span>
              </>
            );

            return (
              <li
                key={item.id}
                className="grid min-w-0 gap-0.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-sm"
              >
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 hover:text-primary hover:underline"
                  >
                    {text}
                  </a>
                ) : (
                  <span className="flex min-w-0 items-center gap-2">{text}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  {[
                    item.sha ? item.sha.slice(0, 7) : null,
                    item.author,
                    formatWhen(item.createdAt),
                    item.movedTo ? `moveu para ${getTaskStatusLabel(item.movedTo)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
