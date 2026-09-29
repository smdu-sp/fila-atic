# Fila ATIC

Sistema interno de gerenciamento de projetos de TI. Solicitantes abrem pedidos, a coordenação faz a triagem e os desenvolvedores acompanham a execução em um Kanban de tarefas.

Para o histórico de decisões e entregas, veja [`docs/journal.md`](docs/journal.md).

## Stack

- Next.js 16 (App Router, server actions) e React 19
- Prisma 7 + PostgreSQL (adapter `pg`)
- NextAuth (JWT) com login via LDAP/Active Directory
- Tailwind CSS 4, shadcn/ui e Base UI

## Código do projeto

Cada projeto tem um código sequencial e permanente (`ATC-0001`, `ATC-0002`, ...), atribuído na criação e nunca reaproveitado mesmo que o projeto seja excluído (coluna `Project.code`, `Int @default(autoincrement())`; formatado por `lib/projectCode.ts`).

## Perfis

| Perfil | Rótulo | Acesso |
| --- | --- | --- |
| `REQUESTER` | Solicitante | Abre projetos e acompanha os próprios |
| `COORDINATOR` | Coordenador | Fila de entrada, usuários, formulário de solicitação, todos os projetos |
| `TECH_LEAD` | Tech Lead | Mesmas permissões do coordenador (todas as verificações passam por `isCoordination` em `lib/roles.ts`) |
| `DEV_GLOBAL` | DEV II | Todos os projetos, atribuição de desenvolvedores e tarefas |
| `DEV_RESTRICTED` | DEV I | Apenas projetos em que foi atribuído |

Usuários precisam ser cadastrados previamente (por e-mail) na tela de usuários. No primeiro login, nome e departamento vêm do LDAP.

## Como rodar

```bash
# 1. banco de dados (Postgres em Docker)
docker compose up -d

# 2. variáveis de ambiente (veja .env.example)
cp .env.example .env

# 3. dependências e client do Prisma
npm install
npx prisma generate

# 4. migrations
npx prisma migrate deploy

# 5. primeiro coordenador (idempotente)
SEED_COORDINATOR_EMAIL=seu.email@dominio.gov.br npm run db:seed

# 6. servidor de desenvolvimento (http://localhost:3003)
npm run dev
```

Sem o passo 5 não há quem cadastre os demais usuários. Se o e-mail já existir, a pessoa é apenas promovida a coordenador.

## Variáveis de ambiente (`.env`)

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Conexão do Postgres |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Configuração do NextAuth |
| `LDAP_URL` (ou `LDAP_SERVER`) | Servidor LDAP |
| `LDAP_BASE_DN` (ou `LDAP_BASE`) | Base de busca de usuários |
| `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` | Usuário de serviço (ou `USER_LDAP` + `LDAP_DOMAIN` / `PASS_LDAP`) |
| `ENVIRONMENT` | `local` pula o LDAP e aceita qualquer senha não vazia |
| `PUBLIC_REQUEST_ALLOWED_DOMAINS` | Domínios de e-mail (separados por vírgula) que podem abrir solicitações em `/solicitar` sem conta. Vazio desativa a função |
| `GITHUB_INTEGRATION_TOKEN` | Segredo (bearer) que autoriza os workflows do GitHub a chamar `/api/integrations/github`. Vazio desativa a rota. Gerar com `openssl rand -hex 32`; o mesmo valor vai no segredo `FILA_ATIC_TOKEN` do GitHub |
| `CRON_SECRET` | Segredo que autoriza o agendador a chamar `/api/cron/deadline-reminders` (avisos de prazo). Vazio desativa a rota |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_TLS_REJECT_UNAUTHORIZED` | Conexão com o servidor de e-mail (relay) que entrega as mensagens — ver seção "E-mail". Sem `SMTP_HOST`, fora de produção o e-mail é impresso no console |

`ENVIRONMENT=local` só vale fora de builds de produção (`NODE_ENV !== "production"`); em produção o LDAP é sempre usado.

## Notificações

Cada pessoa com conta recebe avisos no sino da barra lateral (e na página `/notificacoes`) e, se não desligar em **Perfil**, também por e-mail:

- nova solicitação (coordenação, incluindo Tech Lead);
- tarefa atribuída e inclusão em um projeto (a pessoa atribuída);
- mensagem nova: da equipe para o solicitante, e do solicitante (com conta ou convidado) para a equipe do projeto (ou para a coordenação, se ainda não há equipe);
- mudança de status e de previsão de entrega (solicitante);
- comentário novo em uma tarefa (responsável e quem já comentou);
- prazos: tarefa ou projeto que vence amanhã, vence hoje ou acabou de atrasar.

Quem causa o evento nunca é avisado dele. Convidados (formulário público) não têm conta: continuam recebendo os e-mails com o link de acompanhamento.

### Avisos de prazo (tarefa agendada)

Os avisos de prazo não disparam sozinhos: alguém precisa chamar a rota uma vez por dia. Defina `CRON_SECRET` no `.env` (o mesmo valor deve estar no ambiente do servidor) e agende:

```bash
# Linux/macOS (cron), todo dia às 7h
0 7 * * * cd /caminho/fila-atic && npm run cron:deadlines

# Windows (Agendador de Tarefas)
schtasks /create /tn "Fila ATIC - avisos de prazo" /sc daily /st 07:00 /tr "cmd /c cd /d D:\caminho\fila-atic && npm run cron:deadlines"
```

Rodar mais de uma vez no dia é seguro: cada aviso é entregue uma única vez. A mesma execução apaga notificações lidas há mais de 60 dias e qualquer uma com mais de 180 (e o log de e-mails com mais de 30, ver abaixo). Sem o agendador, todos os outros avisos continuam funcionando; só os de prazo deixam de sair.

## E-mail

O Fila ATIC não entrega e-mail diretamente: ele se conecta, como cliente SMTP, a um **servidor de e-mail separado** (um relay já existente na rede — Exchange, Postfix, etc.) que é quem de fato envia. É o mesmo modelo da integração com o GitHub (`docs/github-runner.md`): a aplicação só precisa de **conexão de saída** para esse outro servidor, numa porta SMTP (`587` com STARTTLS é o padrão; `465` para TLS implícito); nenhuma porta de entrada é necessária.

Configuração (`.env`, ver tabela acima):

- `SMTP_HOST` / `SMTP_PORT` — endereço do relay. Sem `SMTP_HOST`, fora de produção o e-mail só é impresso no console (nada é entregue); em produção, o envio falha.
- `SMTP_SECURE="true"` para TLS implícito (porta `465`); deixe `"false"` para STARTTLS (porta `587`, o mais comum em relay interno).
- `SMTP_USER` / `SMTP_PASS` — só se o relay exigir login. Muitos relays internos aceitam mensagens de qualquer host autorizado na rede (por IP) sem autenticação; nesse caso deixe os dois vazios.
- `SMTP_FROM` — remetente exibido (`"Fila ATIC <fila@prefeitura.sp.gov.br>"`).
- `SMTP_TLS_REJECT_UNAUTHORIZED="false"` — só se o relay apresentar um certificado autoassinado ou de uma CA interna (comum em servidor de e-mail que nunca sai da rede da prefeitura). O padrão (`"true"` ou variável ausente) valida o certificado normalmente.

**Administração > E-mail** (coordenação e Tech Lead) mostra se `SMTP_HOST` está configurado, o servidor/porta/remetente em uso (usuário e senha nunca aparecem na tela), um botão para **enviar um e-mail de teste** e os **últimos e-mails** enviados pelo sistema — confirmações, links de acompanhamento, avisos a solicitantes externos e notificações à equipe — cada um com o resultado (enviado, impresso no console por falta de `SMTP_HOST`, ou falhou, com o motivo). É o primeiro lugar para conferir depois de configurar o relay, e o único jeito de perceber uma falha de entrega sem acesso ao console do servidor: por padrão uma falha só aparece ali (`console.error`) e nesse log.

Confiabilidade: cada envio tenta de novo até 3 vezes com espera crescente quando a falha parece passageira (conexão recusada, tempo esgotado); uma rejeição do próprio relay (endereço inexistente, por exemplo) não é repetida, porque tentar de novo não muda o resultado. As conexões são reaproveitadas entre envios (`pool: true`), o que importa quando os avisos de prazo mandam várias mensagens na mesma execução.

### Modelo visual dos e-mails

Confirmação de solicitação, links de acompanhamento, avisos a solicitante e notificações à equipe usam o mesmo layout HTML (`lib/emailTemplate.ts`, função `renderEmail`): cabeçalho azul com o brasão da prefeitura e "Fila ATIC", título, texto, um botão de ação (com o link também por extenso logo abaixo, para quando o botão não funcionar) ou uma lista de links, e o rodapé com a assinatura. Todo e-mail é enviado como `multipart/alternative` (HTML + texto puro) — quem não abre HTML, ou tem o cliente configurado para não renderizar, recebe a versão em texto, que carrega a mesma informação. Qualquer valor vindo do banco (nome, título de projeto, mensagem) é escapado antes de entrar no HTML, então nada digitado por alguém vira código executável no e-mail de outra pessoa.

O brasão é embutido no e-mail como anexo (`Content-ID`), não carregado do endereço do sistema — assim ele aparece mesmo para quem lê o e-mail fora da rede onde o Fila ATIC roda, e não depende do cliente de e-mail decidir carregar imagens externas. A imagem usada (`public/email-logo.png`, ~6 KB) é uma cópia reduzida de `public/smul_icone_branco.png`, gerada uma vez com `sharp` — para trocar o brasão, gere um novo `email-logo.png` do mesmo jeito (96×96, fundo transparente) em vez de apontar para o arquivo grande original.

## Tarefas e Kanban

Clicar em uma tarefa abre o diálogo completo: título, descrição, status, prioridade, responsável, prazo, etiquetas coloridas (até 8, da paleta cadastrada pela coordenação), anexos e comentários. Só o responsável e a coordenação/DEV II alteram os dados; qualquer pessoa da equipe com acesso ao projeto comenta e anexa. Solicitantes nunca veem tarefas, comentários ou anexos de tarefa. O diálogo de "Nova tarefa" é idêntico ao de edição, inclusive anexos (até 3) e comentários: como a tarefa ainda não existe, eles ficam na tela e são enviados logo depois da criação. No topo do quadro de tarefas, um card mostra o progresso do projeto (percentual, barra e contagem de concluídas/em aberto/canceladas).

Os cartões podem ser arrastados entre colunas e reordenados dentro delas (a posição é gravada; tarefas novas entram no topo). Na visão "Minhas tarefas" só a troca de coluna é possível. O quadro filtra por texto, responsável, prioridade e etiqueta.

A coordenação também classifica cada solicitação em uma categoria (erro/correção, melhoria, sistema novo, suporte/dúvida, outro), filtrável em `/fila` e `/projetos`.

### Etiquetas

As etiquetas de tarefa vêm de uma **paleta gerenciada**: a coordenação (coordenador e tech lead) cadastra nome e cor em **Administração → Etiquetas** e todo o resto da equipe só escolhe da lista — sem variações como "urgente/Urgente/URGENTE!!". A cor é qualquer `#rrggbb` (há 12 sugestões e um seletor livre); o texto do chip escolhe sozinho preto ou branco conforme o contraste. Renomear uma etiqueta atualiza todas as tarefas que a usam; recolorir vale na hora em todo o sistema; excluir remove a etiqueta das tarefas. Comparação de nomes ignora maiúsculas/minúsculas, e o servidor recusa etiqueta que não esteja na paleta. O filtro do Kanban lista a paleta inteira.

## Relatórios

`/relatorios` (coordenação e Tech Lead) mostra indicadores gerais e desempenho por desenvolvedor em gráficos (linha do tempo de solicitações abertas × finalizadas por semana ou mês, rosca por status de solicitação e de tarefa, barras por prioridade, categoria e tempo por etapa, barras empilhadas por desenvolvedor), com filtro opcional de período (data de/até). Contagens de solicitações (por status, prioridade e categoria) e o tempo médio por etapa usam a data em que a solicitação, ou a mudança de status, aconteceu dentro do período; tarefas em aberto e atrasadas por desenvolvedor são sempre a situação atual, independente do período escolhido. O tempo por etapa só considera etapas já concluídas (a etapa atual de um projeto em andamento não entra na média) e depende do histórico em `ProjectStatusChange`, existente a partir da migration `20260918180000_project_status_history_and_task_cancel`.

## Dashboard

`/` mostra os totais por etapa e gráficos: projetos e tarefas por status (para DEV I/II, apenas as tarefas atribuídas a eles) e, para coordenação e Tech Lead, solicitações abertas × finalizadas nas últimas 12 semanas, projetos por prioridade, carga por desenvolvedor (em aberto, separando as atrasadas) e principais solicitantes. Os gráficos usam `recharts`; as cores de status, prioridade e categoria são as mesmas no dashboard e nos relatórios (`lib/chartColors.ts`).

## Emojis

Todo campo de texto livre (chat do projeto, descrição e comentários de tarefa, títulos, formulários de projeto, wiki) tem um botão de "teclado de emojis": categorias, busca em português (ex.: "prazo", "bug", "ok") e recentes. O emoji entra na posição do cursor.

## Wiki

`/wiki` (qualquer pessoa da equipe: coordenação, Tech Lead, DEV I e DEV II — nunca solicitantes) é uma wiki interna simples: páginas em árvore (subpáginas dentro de páginas), conteúdo em **blocos** (estilo Notion: texto, títulos 1–3, listas com marcadores e numeradas, lista de tarefas, citação, destaque com emoji, código, divisor e imagem), pensada para templates, informações de servidores e outros registros do time. Qualquer pessoa da equipe cria, edita e apaga qualquer página — é um espaço coletivo, sem dono. A edição é direta: a página já abre editável, sem botão de editar, e salva sozinha cerca de um segundo depois da última tecla (o indicador embaixo do título mostra "Salvando…" / "Salvo às HH:MM"); sair da página salva o que estiver pendente e fechar a aba com alteração não salva pede confirmação. Se outra pessoa salvar a mesma página enquanto você edita, aparece um aviso com "Recarregar a versão dela" ou "Salvar a minha por cima" — nada é sobrescrito em silêncio. Salvamentos automáticos seguidos da mesma pessoa (janela de 10 minutos) contam como uma revisão só no histórico. Fora do campo em edição, o texto aparece formatado (negrito, itálico, código, links clicáveis). Cada página guarda quem criou e quem editou por último, além de um histórico leve de edições (quem e quando, sem o conteúdo de cada versão). Apagar uma página apaga toda a subárvore dela, inclusive as imagens no disco. No editor: digite `/` para escolher o tipo do bloco; atalhos de Markdown funcionam no começo da linha (`# `, `## `, `- `, `1. `, `[] `, `> `, `---`); Enter cria o próximo bloco (listas continuam, Enter em item vazio sai da lista); Backspace no começo transforma o bloco em texto e depois o junta ao anterior; blocos são arrastados pela alça ou movidos pelo menu "⋯" (que também transforma, duplica e exclui). Dentro do texto valem `**negrito**`, `*itálico*`, código entre crases e links. Imagens entram pelo botão, pelo `/` ou colando da área de transferência, e são servidas por `/uploads/[name]`, como os outros anexos; as que deixam de aparecer na página são apagadas ao salvar. Caixas de tarefa se marcam direto na página. O conteúdo é guardado como JSON (`{"v":2,"blocks":[...]}`); páginas escritas antes, em Markdown, são convertidas automaticamente ao abrir, sem migração.

As páginas na barra lateral podem ser arrastadas: soltar perto do topo/fundo de outra página reordena como irmã dela (em qualquer pai); soltar sobre o meio da página torna a página arrastada uma subpágina dela.

## Anexos

Os anexos das mensagens e das tarefas ficam em `storage/uploads/` (fora de `public/`, ignorado pelo git) e são servidos por `/uploads/[name]`, que exige sessão e acesso ao projeto; arquivos de tarefa são trabalho interno e nunca são entregues a solicitantes. Limites: 3 arquivos por envio, 10 MB cada, apenas tipos de documento e imagem (ver `lib/uploads.ts`). O limite de corpo da requisição (`next.config.ts`) precisa acompanhar esses números: o proxy do Next corta em 10 MB por padrão. Em produção, faça backup desse diretório junto com o banco.

## Scripts

- `npm run dev`: desenvolvimento na porta 3003
- `npm run build` / `npm start`: build e execução de produção
- `npm run lint`: ESLint
- `npm test`: testes automatizados (Vitest). Usam um banco próprio, `<nome>_test` no mesmo servidor, criado e migrado automaticamente. Nunca tocam no banco de desenvolvimento.
- `npm run cron:deadlines`: dispara os avisos de prazo no servidor em execução (ver Notificações)
- `npm run db:seed`: cria ou promove o primeiro coordenador (`SEED_COORDINATOR_EMAIL`)

## CI

`.github/workflows/ci.yml` roda em todo push em `main` e em toda pull request: lint, `tsc --noEmit`, a suíte de testes (contra um Postgres descartável, criado pelo próprio workflow) e um build de produção, nos runners do GitHub.

## Integração com o GitHub (Kanban automático e deploy)

Cada tarefa tem um **código**: o do projeto mais o número dela dentro do projeto (`ATC-0001-3`), mostrado no cartão, no diálogo e na lista de tarefas do projeto. Quem cita o código na mensagem de um commit, no título/descrição de um pull request ou no nome da branch faz a tarefa registrar a atividade (seção **GitHub** do diálogo, com links) e mudar de coluna: commit em branch → Em andamento, PR aberto → Em testes, PR integrado ou commit na `main` → Concluído, deploy em produção → Publicado. A tarefa só avança (configurável) e tarefa cancelada nunca é reativada. A coordenação liga a integração e ajusta as regras em **Administração → GitHub**, onde também vê os últimos eventos recebidos (inclusive os ignorados e o motivo).

Como o servidor não é acessível pela internet, não há webhook: um **runner auto-hospedado** instalado no próprio servidor executa os workflows `fila-atic-sync.yml` (avisa o sistema de push e pull request via `scripts/github-notify.mjs` → `POST /api/integrations/github`, autenticado por `GITHUB_INTEGRATION_TOKEN`) e `deploy.yml` (CD com regras: só a `main` com CI verde, aprovação no ambiente `production`, um deploy por vez, backup opcional, migrations, build, verificação de saúde e retorno automático à versão anterior se falhar — `scripts/deploy.mjs`).

**Guia completo de instalação do runner, configuração do servidor, do GitHub e do sistema, teste ponta a ponta e solução de problemas: [`docs/github-runner.md`](docs/github-runner.md).**
