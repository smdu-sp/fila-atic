# Fila ATIC

Sistema interno de fila de chamados/projetos de TI. Solicitantes abrem pedidos, a coordenação faz a triagem e os desenvolvedores acompanham a execução em um Kanban de tarefas.

## Stack

- Next.js 16 (App Router, server actions) e React 19
- Prisma 7 + PostgreSQL (adapter `pg`)
- NextAuth (JWT) com login via LDAP/Active Directory
- Tailwind CSS 4, shadcn/ui e Base UI

## Perfis

| Perfil | Rótulo | Acesso |
| --- | --- | --- |
| `REQUESTER` | Solicitante | Abre chamados e acompanha os próprios |
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
| `CRON_SECRET` | Segredo que autoriza o agendador a chamar `/api/cron/deadline-reminders` (avisos de prazo). Vazio desativa a rota |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio de e-mails (confirmação e avisos). Sem `SMTP_HOST`, fora de produção o e-mail é impresso no console |

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

Rodar mais de uma vez no dia é seguro: cada aviso é entregue uma única vez. A mesma execução apaga notificações lidas há mais de 60 dias e qualquer uma com mais de 180. Sem o agendador, todos os outros avisos continuam funcionando; só os de prazo deixam de sair.

## Tarefas e Kanban

Clicar em uma tarefa abre o diálogo completo: título, descrição, status, prioridade, responsável, prazo, etiquetas (até 8), anexos e comentários. Só o responsável e a coordenação/DEV II alteram os dados; qualquer pessoa da equipe com acesso ao projeto comenta e anexa. Solicitantes nunca veem tarefas, comentários ou anexos de tarefa.

Os cartões podem ser arrastados entre colunas e reordenados dentro delas (a posição é gravada; tarefas novas entram no topo). Na visão "Minhas tarefas" só a troca de coluna é possível. O quadro filtra por texto, responsável, prioridade e etiqueta.

A coordenação também classifica cada solicitação em uma categoria (erro/correção, melhoria, sistema novo, suporte/dúvida, outro), filtrável em `/fila` e `/projetos`.

## Relatórios

`/relatorios` (coordenação e Tech Lead) mostra indicadores gerais e desempenho por desenvolvedor, com filtro opcional de período (data de/até). Contagens de solicitações (por status, prioridade e categoria) e o tempo médio por etapa usam a data em que a solicitação, ou a mudança de status, aconteceu dentro do período; tarefas em aberto e atrasadas por desenvolvedor são sempre a situação atual, independente do período escolhido. O tempo por etapa só considera etapas já concluídas (a etapa atual de um projeto em andamento não entra na média) e depende do histórico em `ProjectStatusChange`, existente a partir da migration `20260918180000_project_status_history_and_task_cancel`.

## Anexos

Os anexos das mensagens e das tarefas ficam em `storage/uploads/` (fora de `public/`, ignorado pelo git) e são servidos por `/uploads/[name]`, que exige sessão e acesso ao chamado; arquivos de tarefa são trabalho interno e nunca são entregues a solicitantes. Limites: 3 arquivos por envio, 10 MB cada, apenas tipos de documento e imagem (ver `lib/uploads.ts`). O limite de corpo da requisição (`next.config.ts`) precisa acompanhar esses números: o proxy do Next corta em 10 MB por padrão. Em produção, faça backup desse diretório junto com o banco.

## Scripts

- `npm run dev`: desenvolvimento na porta 3003
- `npm run build` / `npm start`: build e execução de produção
- `npm run lint`: ESLint
- `npm test`: testes automatizados (Vitest). Usam um banco próprio, `<nome>_test` no mesmo servidor, criado e migrado automaticamente. Nunca tocam no banco de desenvolvimento.
- `npm run cron:deadlines`: dispara os avisos de prazo no servidor em execução (ver Notificações)
- `npm run db:seed`: cria ou promove o primeiro coordenador (`SEED_COORDINATOR_EMAIL`)
