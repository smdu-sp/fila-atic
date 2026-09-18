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
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio de e-mails (confirmação e avisos). Sem `SMTP_HOST`, fora de produção o e-mail é impresso no console |

`ENVIRONMENT=local` só vale fora de builds de produção (`NODE_ENV !== "production"`); em produção o LDAP é sempre usado.

## Anexos

Os anexos das mensagens ficam em `storage/uploads/` (fora de `public/`, ignorado pelo git) e são servidos por `/uploads/[name]`, que exige sessão e acesso ao chamado. Limites: 3 arquivos por mensagem, 10 MB cada, apenas tipos de documento e imagem (ver `lib/uploads.ts`). Em produção, faça backup desse diretório junto com o banco.

## Scripts

- `npm run dev`: desenvolvimento na porta 3003
- `npm run build` / `npm start`: build e execução de produção
- `npm run lint`: ESLint
- `npm test`: testes automatizados (Vitest). Usam um banco próprio, `<nome>_test` no mesmo servidor, criado e migrado automaticamente. Nunca tocam no banco de desenvolvimento.
- `npm run db:seed`: cria ou promove o primeiro coordenador (`SEED_COORDINATOR_EMAIL`)
