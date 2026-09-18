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
| `DEV_GLOBAL` | DEV II | Todos os projetos, atribuição de desenvolvedores e tarefas |
| `DEV_RESTRICTED` | DEV I | Apenas projetos em que foi atribuído |

Usuários precisam ser cadastrados previamente (por e-mail) na tela de usuários. No primeiro login, nome e departamento vêm do LDAP.

## Como rodar

```bash
# 1. banco de dados (Postgres em Docker)
docker compose up -d

# 2. dependências e client do Prisma
npm install
npx prisma generate

# 3. migrations
npx prisma migrate deploy

# 4. servidor de desenvolvimento (http://localhost:3003)
npm run dev
```

O projeto não tem seed: o primeiro coordenador precisa ser inserido direto na tabela `User` (por exemplo via `npx prisma studio`) com `role = COORDINATOR`.

## Variáveis de ambiente (`.env`)

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Conexão do Postgres |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | Configuração do NextAuth |
| `LDAP_URL` (ou `LDAP_SERVER`) | Servidor LDAP |
| `LDAP_BASE_DN` (ou `LDAP_BASE`) | Base de busca de usuários |
| `LDAP_BIND_DN` / `LDAP_BIND_PASSWORD` | Usuário de serviço (ou `USER_LDAP` + `LDAP_DOMAIN` / `PASS_LDAP`) |
| `ENVIRONMENT` | `local` pula o LDAP e aceita qualquer senha não vazia |

`ENVIRONMENT=local` só vale fora de builds de produção (`NODE_ENV !== "production"`); em produção o LDAP é sempre usado.

## Anexos

Os anexos das mensagens ficam em `storage/uploads/` (fora de `public/`, ignorado pelo git) e são servidos por `/uploads/[name]`, que exige sessão e acesso ao chamado. Limites: 3 arquivos por mensagem, 10 MB cada, apenas tipos de documento e imagem (ver `lib/uploads.ts`). Em produção, faça backup desse diretório junto com o banco.

## Scripts

- `npm run dev`: desenvolvimento na porta 3003
- `npm run build` / `npm start`: build e execução de produção
- `npm run lint`: ESLint
