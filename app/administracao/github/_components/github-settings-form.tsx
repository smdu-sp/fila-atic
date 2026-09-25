"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TaskStatus } from "@prisma/client";
import { toast } from "sonner";

import {
  updateGithubSettings,
  type GithubAdminData,
} from "@/actions/githubActions";
import { TASK_STATUS_ORDER } from "@/app/kanban/_components/task-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const NONE = "none";

type Rule = {
  key: "onPush" | "onPullRequestOpened" | "onMerge" | "onDeploy";
  title: string;
  hint: string;
};

const RULES: Rule[] = [
  {
    key: "onPush",
    title: "Commit em qualquer branch (menos a principal)",
    hint: "Quem começa a trabalhar na tarefa. Ex.: Em andamento.",
  },
  {
    key: "onPullRequestOpened",
    title: "Pull request aberto",
    hint: "Pronto para revisão/testes. Ex.: Em testes.",
  },
  {
    key: "onMerge",
    title: "Pull request integrado ou commit na branch principal",
    hint: "O código entrou. Ex.: Concluído.",
  },
  {
    key: "onDeploy",
    title: "Deploy concluído em produção",
    hint: "Está no ar. Ex.: Publicado.",
  },
];

export function GithubSettingsForm({
  data,
  statusLabels,
}: {
  data: GithubAdminData;
  statusLabels: Record<TaskStatus, string>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { settings } = data;

  const [enabled, setEnabled] = useState(settings.enabled);
  const [repositories, setRepositories] = useState(settings.repositories.join("\n"));
  const [mainBranch, setMainBranch] = useState(settings.mainBranch);
  const [rules, setRules] = useState<Record<Rule["key"], TaskStatus | null>>({
    onPush: settings.onPush,
    onPullRequestOpened: settings.onPullRequestOpened,
    onMerge: settings.onMerge,
    onDeploy: settings.onDeploy,
  });
  const [onlyForward, setOnlyForward] = useState(settings.onlyForward);

  const save = () =>
    startTransition(async () => {
      const result = await updateGithubSettings({
        enabled,
        repositories: repositories.split(/[\n,]/),
        mainBranch,
        ...rules,
        onlyForward,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Configuração salva.");
      router.refresh();
    });

  return (
    <div className="grid min-w-0 gap-6">
      <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <span className="grid gap-0.5 text-sm">
          <span className="font-medium">Integração ativa</span>
          <span className="text-muted-foreground">
            Desligada, o sistema recusa tudo que os workflows enviarem (o token continua
            valendo, mas nada é gravado).
          </span>
        </span>
      </label>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <Label htmlFor="github-main-branch">Branch principal</Label>
          <Input
            id="github-main-branch"
            value={mainBranch}
            maxLength={100}
            onChange={(event) => setMainBranch(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            Commits nela contam como &quot;integrado&quot;; nas demais, como trabalho em andamento.
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <Label htmlFor="github-repositories">Repositórios aceitos</Label>
          <Textarea
            id="github-repositories"
            rows={2}
            value={repositories}
            placeholder="smdu-sp/fila-atic"
            onChange={(event) => setRepositories(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            Um por linha, no formato organização/repositório. Vazio aceita qualquer um.
          </span>
        </div>
      </div>

      <div className="grid min-w-0 gap-3">
        <div>
          <h3 className="text-sm font-medium">O que cada evento faz com a tarefa</h3>
          <p className="text-xs text-muted-foreground">
            A tarefa é encontrada pelo código na mensagem do commit, no título/descrição do pull
            request ou no nome da branch (ex.: <span className="font-mono">ATC-0001-3</span>).
          </p>
        </div>
        {RULES.map((rule) => (
          <div
            key={rule.key}
            className="grid min-w-0 gap-2 rounded-lg border border-border/60 p-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center"
          >
            <div className="grid min-w-0 gap-0.5">
              <span className="text-sm font-medium">{rule.title}</span>
              <span className="text-xs text-muted-foreground">{rule.hint}</span>
            </div>
            <Select
              value={rules[rule.key] ?? NONE}
              onValueChange={(value) =>
                setRules((current) => ({
                  ...current,
                  [rule.key]: value === NONE ? null : (value as TaskStatus),
                }))
              }
            >
              <SelectTrigger className="w-full" aria-label={rule.title}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não mover a tarefa</SelectItem>
                {TASK_STATUS_ORDER.filter((status) => status !== TaskStatus.CANCELED).map((status) => (
                  <SelectItem key={status} value={status}>
                    Mover para: {statusLabels[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
        <input
          type="checkbox"
          checked={onlyForward}
          onChange={(event) => setOnlyForward(event.target.checked)}
          className="mt-1 size-4 accent-primary"
        />
        <span className="grid gap-0.5 text-sm">
          <span className="font-medium">Só avançar</span>
          <span className="text-muted-foreground">
            Um evento nunca leva a tarefa para uma coluna anterior (um commit tardio numa tarefa
            já concluída não a reabre). Tarefas canceladas nunca são reativadas.
          </span>
        </span>
      </label>

      <div>
        <Button onClick={save} disabled={isPending}>
          {isPending ? "Salvando" : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}
