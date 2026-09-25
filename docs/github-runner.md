# Integração com o GitHub: runner no servidor, Kanban automático e deploy

Este documento explica, do zero, como ligar o repositório do Fila ATIC ao próprio sistema:

- **commit → Kanban**: quem cita o código de uma tarefa (`ATC-0001-3`) num commit, pull request ou nome de branch faz a tarefa mostrar a atividade e mudar de coluna sozinha;
- **CI**: lint, tipos, testes e build a cada push e pull request (já existe em `.github/workflows/ci.yml`);
- **CD com regras**: depois que o CI passa na `main`, o sistema é atualizado no servidor, com aprovação, backup opcional, verificação de saúde e retorno automático se algo der errado.

Quem lê: a pessoa que vai instalar e manter o runner no servidor (precisa de acesso administrativo ao servidor e ao repositório no GitHub) e a coordenação, que configura as regras no sistema.

---

## 1. O que vamos montar e por quê

O servidor do Fila ATIC **não é acessível pela internet**. Por isso o GitHub não consegue "avisar" o sistema (webhook). A solução é inverter o sentido: instalamos no próprio servidor um **runner auto-hospedado** do GitHub Actions. Ele é um programa que fica **perguntando ao GitHub, de dentro para fora** (conexão HTTPS de saída), se há trabalho. Quando há, executa o job **na máquina do servidor** — e dali consegue falar com o Fila ATIC pelo endereço interno.

```
                    internet                              rede interna
  ┌────────┐    ┌──────────────┐   HTTPS (saída)    ┌────────────────────────────┐
  │ Dev    │───▶│   GitHub     │◀───────────────────│ Servidor                   │
  │ push / │    │  (repo,      │  "há job para mim?"│  ┌──────────────────────┐  │
  │ PR     │    │   Actions)   │                    │  │ runner (fila-atic)   │  │
  └────────┘    └──────────────┘                    │  └─────────┬────────────┘  │
                                                    │            │ 1) POST /api/  │
                                                    │            │ integrations/  │
                                                    │            ▼ github         │
                                                    │  ┌──────────────────────┐  │
                                                    │  │ Fila ATIC (Next.js)  │  │
                                                    │  │ Kanban, logs, banco  │  │
                                                    │  └──────────────────────┘  │
                                                    │  2) deploy: git, npm,      │
                                                    │     migrations, build,     │
                                                    │     restart                │
                                                    └────────────────────────────┘
```

O que roda **fora** do servidor (nos runners do próprio GitHub): só o **CI** (`ci.yml`), que sobe um Postgres descartável e não precisa de acesso interno.
O que roda **no runner do servidor**: o aviso ao Fila ATIC (`fila-atic-sync.yml`) e o deploy (`deploy.yml`).

### Quem faz o quê

| Evento no GitHub | O que acontece no Fila ATIC (padrão, configurável) |
|---|---|
| Commit (push) numa branch qualquer citando `ATC-0001-3` | Aparece na tarefa; tarefa vai para **Em andamento** |
| Pull request aberto citando o código | Tarefa vai para **Em testes** |
| Pull request integrado (merge) ou commit direto na `main` | Tarefa vai para **Concluído** |
| Deploy concluído em produção | Tarefa vai para **Publicado** |
| Deploy que falhou | Só registra na tarefa; nada muda de coluna |

Regras fixas: a tarefa **só avança** (um commit tardio não reabre uma tarefa concluída — dá para desligar), e tarefa **cancelada nunca é reativada**. Tudo que chega fica registrado em **Administração → GitHub → Últimos eventos**, inclusive o que foi ignorado e por quê.

---

## 2. Antes de começar

### 2.1 O que você precisa ter

- **Servidor** onde o Fila ATIC já roda (ou vai rodar), com acesso administrativo. O guia principal usa **Linux (Ubuntu/Debian, com systemd)**; a seção 5 traz as diferenças para **Windows Server**.
- **Acesso de saída HTTPS (porta 443)** do servidor para o GitHub (lista na seção 4.4). Não é preciso abrir nenhuma porta de entrada.
- **Permissão de administrador no repositório** `smdu-sp/fila-atic` (ou da organização), para registrar o runner, criar variáveis/segredos e configurar o ambiente `production`.
- **Node.js 22** e **git** no servidor, e o **PostgreSQL** já acessível pelo Fila ATIC.
- Um usuário do sistema operacional dedicado (sugestão: `fila-atic`).

### 2.2 Regra de ouro de segurança

> **Runner auto-hospedado só em repositório privado.** Quem consegue abrir um pull request num repositório **público** consegue executar código na máquina do runner. Como o `smdu-sp/fila-atic` é privado, o risco fica restrito a quem já tem acesso de escrita. Se um dia o repositório virar público, **remova o runner antes**.

Outras medidas já embutidas nos workflows: `pull_request_target` (o script vem sempre da branch padrão, nunca do pull request), `permissions: contents: read`, aprovação obrigatória no ambiente `production`, um deploy por vez.

### 2.3 Convenções que usaremos ao longo do guia

| Item | Valor de exemplo (troque pelo seu) |
|---|---|
| Usuário do sistema | `fila-atic` |
| Pasta da aplicação | `/opt/fila-atic` |
| Serviço da aplicação | `fila-atic` (systemd) |
| Pasta do runner | `/opt/actions-runner` |
| Endereço interno do sistema | `http://fila-atic.smul.interno:3003` (o que os usuários usam; `http://localhost:3003` também serve, já que o runner está na mesma máquina) |
| Etiqueta (label) do runner | `fila-atic` |

---

## 3. Passo a passo (Linux)

### Passo 1 — Preparar o servidor

**1.1 Usuário dedicado** (sem senha de login interativo; ele só existe para rodar o sistema e o runner):

```bash
sudo adduser --system --group --home /opt/fila-atic-home --shell /bin/bash fila-atic
```

**1.2 Node.js 22 e git** (Ubuntu/Debian, pelo repositório oficial NodeSource):

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # deve mostrar v22.x
```

**1.3 Clonar a aplicação** na pasta que o deploy vai atualizar. Use uma chave de deploy (somente leitura) ou um token; o exemplo usa HTTPS com token de leitura:

```bash
sudo mkdir -p /opt/fila-atic && sudo chown fila-atic:fila-atic /opt/fila-atic
sudo -u fila-atic git clone https://github.com/smdu-sp/fila-atic.git /opt/fila-atic
```

> Repositório privado: crie uma **deploy key** (Settings → Deploy keys, somente leitura), gere a chave com `ssh-keygen -t ed25519` como usuário `fila-atic` e clone por SSH (`git@github.com:smdu-sp/fila-atic.git`). O deploy usa `git fetch origin`, então o `origin` precisa autenticar sem pedir senha.

**1.4 Arquivo `.env`** da aplicação (nunca vai para o git). Copie o modelo e preencha (ver o README, seção "Variáveis de ambiente"); o que é novo para esta integração é `GITHUB_INTEGRATION_TOKEN`, criado no Passo 4:

```bash
cd /opt/fila-atic
sudo -u fila-atic cp .env.example .env
sudo -u fila-atic nano .env
sudo chmod 600 /opt/fila-atic/.env      # só o usuário lê
```

**1.5 Primeira instalação manual** (para confirmar que tudo funciona antes de automatizar):

```bash
cd /opt/fila-atic
sudo -u fila-atic npm ci
sudo -u fila-atic npx prisma migrate deploy
sudo -u fila-atic npm run build
```

**1.6 Serviço systemd da aplicação**, para ela subir com o servidor e poder ser reiniciada pelo deploy. Crie `/etc/systemd/system/fila-atic.service`:

```ini
[Unit]
Description=Fila ATIC
After=network.target postgresql.service

[Service]
Type=simple
User=fila-atic
Group=fila-atic
WorkingDirectory=/opt/fila-atic
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now fila-atic
sudo systemctl status fila-atic          # deve estar "active (running)"
curl -I http://localhost:3003/login      # deve responder 200
```

**1.7 Permissão para reiniciar só esse serviço, sem senha.** O deploy roda como o usuário `fila-atic` e precisa reiniciar o serviço. Em vez de dar `sudo` amplo, libere **apenas** esse comando:

```bash
sudo visudo -f /etc/sudoers.d/fila-atic
```

```
fila-atic ALL=(root) NOPASSWD: /usr/bin/systemctl restart fila-atic
```

Teste: `sudo -u fila-atic sudo -n systemctl restart fila-atic` não pode pedir senha.

**1.7b (opcional, recomendado) Backup antes de cada deploy.** Crie `/opt/fila-atic-backup.sh` (dono `fila-atic`, `chmod 700`):

```bash
#!/usr/bin/env bash
set -euo pipefail
set -a; source /opt/fila-atic/.env; set +a           # carrega DATABASE_URL
mkdir -p /var/backups/fila-atic
pg_dump "${DATABASE_URL%%\?*}" | gzip > "/var/backups/fila-atic/$(date +%F-%H%M).sql.gz"
find /var/backups/fila-atic -name '*.sql.gz' -mtime +30 -delete   # guarda 30 dias
```

(`sudo apt-get install postgresql-client` se o `pg_dump` não existir; `sudo mkdir -p /var/backups/fila-atic && sudo chown fila-atic /var/backups/fila-atic`.)

### Passo 2 — Instalar o runner do GitHub

**2.1 Pegar o comando de instalação na tela do GitHub.** No repositório: **Settings → Actions → Runners → New self-hosted runner**, escolha **Linux** e a arquitetura (x64 em geral). A página mostra três blocos: *Download*, *Configure* e *Using your self-hosted runner*. O **token** do bloco *Configure* vale por cerca de **1 hora** e só serve para registrar; gere outro se expirar. (Para vários repositórios, registre o runner na **organização**: Settings da organização → Actions → Runners — use o mesmo procedimento.)

**2.2 Baixar e extrair** (a versão muda: **copie os comandos da própria página do GitHub**; os abaixo são só o formato). Faça como o usuário `fila-atic`:

```bash
sudo mkdir -p /opt/actions-runner && sudo chown fila-atic:fila-atic /opt/actions-runner
sudo -u fila-atic -i bash -c '
  cd /opt/actions-runner
  curl -o actions-runner-linux-x64.tar.gz -L https://github.com/actions/runner/releases/download/vX.Y.Z/actions-runner-linux-x64-X.Y.Z.tar.gz
  tar xzf actions-runner-linux-x64.tar.gz
'
```

**2.3 Registrar** — o ponto mais importante é o `--labels fila-atic`, porque é por ele que os workflows escolhem esta máquina (`runs-on: [self-hosted, fila-atic]`):

```bash
sudo -u fila-atic -i bash -c '
  cd /opt/actions-runner
  ./config.sh --unattended \
    --url https://github.com/smdu-sp/fila-atic \
    --token COLE_AQUI_O_TOKEN_DA_PAGINA \
    --name servidor-fila-atic \
    --labels fila-atic \
    --work _work
'
```

Ele deve terminar com "Runner successfully added" e "Settings Saved".

**2.4 Instalar como serviço** (sobe com o servidor, reinicia sozinho se cair):

```bash
cd /opt/actions-runner
sudo ./svc.sh install fila-atic       # "fila-atic" = usuário que executa
sudo ./svc.sh start
sudo ./svc.sh status                  # "active (running)"
```

**2.5 Conferir no GitHub:** Settings → Actions → Runners: o runner `servidor-fila-atic` aparece como **Idle** (verde), com as etiquetas `self-hosted`, `Linux`, `X64`, `fila-atic`. Se aparecer **Offline**, veja a seção 8.

### Passo 3 — Rede, proxy e firewall

O runner só precisa de **saída HTTPS (443)**. Libere, no firewall/proxy da rede:

- `github.com`, `api.github.com`
- `*.actions.githubusercontent.com`, `*.pipelines.actions.githubusercontent.com`, `pipelinesghubeus*.actions.githubusercontent.com`
- `codeload.github.com`, `objects.githubusercontent.com`, `*.blob.core.windows.net` (download de ações e artefatos)
- `registry.npmjs.org` (o `npm ci` do deploy) e `nodejs.org` (`actions/setup-node`)

A lista oficial e atualizada está em *docs.github.com → Self-hosted runners → Communicating with GitHub*; confira com a área de redes.

**Se a saída passa por proxy**, crie o arquivo `/opt/actions-runner/.env` (é do runner, não do sistema) e reinicie o serviço:

```
https_proxy=http://proxy.smul.interno:3128
http_proxy=http://proxy.smul.interno:3128
no_proxy=localhost,127.0.0.1,fila-atic.smul.interno
```

**Se o proxy inspeciona TLS** (certificado próprio da prefeitura), o Node e o git precisam confiar nele: coloque o certificado raiz em `/opt/certs/proxy-ca.pem` e acrescente no mesmo `.env` do runner `NODE_EXTRA_CA_CERTS=/opt/certs/proxy-ca.pem` e `GIT_SSL_CAINFO=/opt/certs/proxy-ca.pem`; para o `npm`, `sudo -u fila-atic npm config set cafile /opt/certs/proxy-ca.pem`.

### Passo 4 — Configurar o Fila ATIC

**4.1 Gerar o token da integração** (um segredo longo, só você e o GitHub sabem):

```bash
openssl rand -hex 32
```

**4.2 Guardá-lo no `.env` da aplicação** e reiniciar:

```bash
sudo -u fila-atic nano /opt/fila-atic/.env
#   GITHUB_INTEGRATION_TOKEN="cole-o-valor-gerado"
sudo systemctl restart fila-atic
```

Sem esse valor a rota `/api/integrations/github` fica desativada (responde 503). O valor **nunca** é mostrado no sistema nem guardado no banco.

**4.3 Ativar e configurar na tela.** Entre como coordenador ou Tech Lead → **Administração → GitHub**:

1. Confira o selo verde **"Token configurado no servidor"**.
2. Marque **Integração ativa**.
3. **Repositórios aceitos:** `smdu-sp/fila-atic` (um por linha; vazio aceita qualquer repositório que tenha o token).
4. **Branch principal:** `main`.
5. Ajuste o que cada evento faz com a tarefa (os padrões descritos na seção 1 já são razoáveis) e deixe **Só avançar** marcado.
6. **Salvar configuração.**

### Passo 5 — Configurar o GitHub

No repositório, **Settings → Secrets and variables → Actions**:

**Aba *Variables*** (valores não secretos):

| Nome | Valor de exemplo | Para quê |
|---|---|---|
| `FILA_ATIC_URL` | `http://localhost:3003` | Endereço do sistema **visto do runner** (mesma máquina → `localhost` funciona) |
| `FILA_ATIC_APP_DIR` | `/opt/fila-atic` | Pasta da aplicação que o deploy atualiza |
| `FILA_ATIC_RESTART_CMD` | `sudo systemctl restart fila-atic` | Como reiniciar o sistema |
| `FILA_ATIC_HEALTH_URL` | `http://localhost:3003/login` | Endereço que responde quando o sistema está no ar |
| `FILA_ATIC_BACKUP_CMD` | `/opt/fila-atic-backup.sh` | (opcional) backup antes das migrations |

**Aba *Secrets*:**

| Nome | Valor |
|---|---|
| `FILA_ATIC_TOKEN` | O **mesmo** valor de `GITHUB_INTEGRATION_TOKEN` do passo 4.2 |

**Ambiente `production`** (Settings → Environments → New environment → `production`):

- **Required reviewers:** adicione quem pode aprovar deploys (Tech Lead, coordenação). Todo deploy fica parado esperando "Review deployments → Approve";
- **Deployment branches and tags → Selected branches → `main`**: impede que qualquer outra branch faça deploy, mesmo por engano;
- (opcional) **Wait timer** de alguns minutos, para dar tempo de cancelar.

**Proteção da `main`** (Settings → Branches → Add rule para `main`):

- *Require a pull request before merging*;
- *Require status checks to pass* → selecione **CI** (o job do `ci.yml`) — assim nada com testes quebrados entra na `main`;
- (opcional) *Require approvals* (revisão de pelo menos 1 pessoa).

### Passo 6 — Testar de ponta a ponta

Faça nesta ordem; cada etapa prova uma parte:

1. **Conexão.** GitHub → Actions → **Fila ATIC sync** → *Run workflow*. O job roda no seu runner e deve terminar em verde imprimindo `Fila ATIC respondeu: {"ok":true,...,"summary":"Teste de conexão"}`. No sistema, **Administração → GitHub → Últimos eventos** mostra o "Teste" como *Processado*.
2. **Commit → Kanban.** No sistema, crie uma tarefa e abra-a: o código aparece ao lado do título (ex.: `ATC-0001-3`) e há botões para copiar o código e um nome de branch sugerido. Numa branch de teste, faça um commit com o código na mensagem e dê push:
   ```bash
   git switch -c feature/ATC-0001-3-teste
   git commit --allow-empty -m "teste: integração ATC-0001-3"
   git push -u origin HEAD
   ```
   Em alguns segundos a tarefa vai para **Em andamento**, e o commit aparece na seção **GitHub** dela.
3. **Pull request.** Abra um PR dessa branch com o código no título → tarefa vai para **Em testes**. O CI roda nos runners do GitHub.
4. **Merge e deploy.** Faça o merge (o CI precisa estar verde) → tarefa vai para **Concluído**; o workflow **Deploy** inicia, espera a sua aprovação em *Review deployments*, roda no servidor e, ao terminar, a tarefa vai para **Publicado**.

Se algo não aconteceu, a seção 8 tem o roteiro de diagnóstico.

---

## 4. Como os desenvolvedores trabalham a partir de agora

### 4.1 O código da tarefa

Toda tarefa tem um código: **código do projeto + número da tarefa dentro do projeto**, ex.: `ATC-0001-3` = tarefa 3 do projeto `ATC-0001`. Os números nunca são reutilizados, mesmo se a tarefa for excluída. O código aparece no cartão do Kanban, no diálogo da tarefa e na lista de tarefas do projeto.

### 4.2 Onde citar o código

Vale **qualquer um** destes (o sistema procura em todos), sem diferenciar maiúsculas/minúsculas:

- **Mensagem do commit:** `fix: corrige validação do prazo (ATC-0001-3)`
- **Nome da branch:** `feature/ATC-0001-3-validacao-prazo` — todos os commits dessa branch já contam (o botão *Copiar nome da branch* na tarefa gera um nome assim)
- **Título ou descrição do pull request:** `Validação do prazo (ATC-0001-3)`

Vários códigos na mesma mensagem funcionam (`ATC-0001-3 e ATC-0001-5`). O código do **projeto** sozinho (`ATC-0001`) não conta — precisa do número da tarefa.

### 4.3 Exemplo do dia a dia

```bash
git switch -c feature/ATC-0001-3-validacao-prazo   # tarefa vai para "Em andamento" no primeiro push
git commit -m "feat: valida prazo no formulário"
git push -u origin HEAD
# abrir o PR com "(ATC-0001-3)" no título                  → "Em testes"
# merge do PR (CI verde)                                    → "Concluído"
# aprovar o deploy no GitHub                                → "Publicado"
```

---

## 5. Diferenças no Windows Server

Os conceitos são os mesmos; mudam os comandos.

- **Node.js 22 e git:** instaladores oficiais (`nodejs.org`, `git-scm.com`); confira `node --version` e `git --version` num PowerShell novo.
- **Pasta e conta:** `C:\fila-atic` (aplicação) e `C:\actions-runner` (runner). Crie uma conta local dedicada (`fila-atic`) sem privilégios de administrador, com permissão de **modificar** nas duas pastas.
- **Aplicação como serviço:** use o **NSSM** (`nssm.cc`): `nssm install fila-atic "C:\Program Files\nodejs\npm.cmd" run start` com *Startup directory* `C:\fila-atic` e a variável `NODE_ENV=production`. Comando de reinício da variável `FILA_ATIC_RESTART_CMD`: `nssm restart fila-atic`. Para o runner poder reiniciar o serviço sem ser administrador: `sc sdset fila-atic` com uma permissão de *start/stop* para a conta `fila-atic` (ou rode o serviço do runner com uma conta que já tenha esse direito).
- **Runner:** na página *New self-hosted runner* escolha **Windows**. Em PowerShell:
  ```powershell
  cd C:\actions-runner
  .\config.cmd --unattended --url https://github.com/smdu-sp/fila-atic --token <TOKEN> --name servidor-fila-atic --labels fila-atic --runasservice --windowslogonaccount ".\fila-atic" --windowslogonpassword "<senha>"
  ```
  `--runasservice` instala e inicia o serviço do Windows.
- **Proxy:** variáveis de ambiente do sistema (`https_proxy`, `no_proxy`) ou o arquivo `C:\actions-runner\.env`.
- **Backup (variável `FILA_ATIC_BACKUP_CMD`):** um `.ps1` que chame `pg_dump.exe` e salve com data no nome, ex.: `powershell -File C:\fila-atic-backup.ps1`.
- Os scripts do repositório (`scripts/deploy.mjs`, `scripts/github-notify.mjs`) são Node e funcionam igual nos dois sistemas; os comandos são executados por `cmd.exe`.

---

## 6. As regras do CD (deploy contínuo)

O workflow `.github/workflows/deploy.yml` aplica, nesta ordem:

1. **Só a `main` e só com CI verde.** Dispara quando o workflow **CI** termina com sucesso numa branch `main` (`workflow_run`). CI vermelho nunca chega à produção.
2. **Aprovação humana.** O job pertence ao ambiente `production`; com *Required reviewers* configurado, o deploy espera aprovação e registra quem aprovou e quando.
3. **Um deploy por vez.** `concurrency: deploy-production` (sem cancelar o que já começou).
4. **O deploy em si** (`scripts/deploy.mjs`, na pasta da aplicação): `git fetch` e `git checkout` do commit exato → backup (se configurado) → `npm ci` → `prisma migrate deploy` → `prisma generate` → `npm run build` → reinício → espera o sistema responder (até 90 s).
5. **Retorno automático.** Se qualquer passo falhar ou o sistema não voltar, o script recompila e reinicia o **commit anterior** e o job termina em vermelho. **As migrations não são desfeitas** (o banco só anda para a frente): por isso, uma migration precisa ser compatível com a versão anterior do código por uma versão (por exemplo, criar coluna nova em vez de renomear; remover a antiga só no deploy seguinte). O backup é a rede de segurança para o resto.
6. **Aviso ao Fila ATIC.** Deploy bem-sucedido → tarefas dos commits publicados vão para **Publicado**; falha → registra na tarefa.

**Deploy manual / voltar uma versão:** Actions → **Deploy** → *Run workflow* → informe o **commit** (o anterior, para voltar). Passa pela mesma aprovação.

**Quer deploy só manual?** Apague o bloco `workflow_run:` do `deploy.yml` (deixe só `workflow_dispatch`).

**Quer deploy sem aprovação?** Tire os *Required reviewers* do ambiente `production` (mantenha *Deployment branches → main*).

---

## 7. Segurança e boas práticas

- **Repositório privado, sempre** (seção 2.2).
- **Usuário sem privilégios:** o runner e o sistema rodam como `fila-atic`, que só tem `sudo` para reiniciar o serviço. Nunca coloque o runner para rodar como `root`.
- **Segredo só no lugar certo:** `FILA_ATIC_TOKEN` (GitHub Secrets) e `GITHUB_INTEGRATION_TOKEN` (`.env` do servidor, `chmod 600`). Não coloque em variáveis (que são visíveis), em issue, chat ou commit. **Para trocar:** gere um novo (`openssl rand -hex 32`), atualize os dois lados e reinicie; troque também se alguém que conhecia sair da equipe.
- **Rota protegida:** `/api/integrations/github` exige o token (comparação em tempo constante), recusa corpo acima de 2 MB, valida o formato do que recebe e fica desligada sem token ou com a integração desativada na tela.
- **O que o runner enxerga:** tudo que os workflows executam. Por isso os workflows são pequenos, versionados e revisados por pull request; mudanças em `.github/workflows/` e `scripts/` merecem revisão atenta (ative *CODEOWNERS* para elas se quiser).
- **Backups:** teste a restauração de tempos em tempos (`gunzip -c arquivo.sql.gz | psql ...` num banco de teste).
- **Atualizar o runner:** ele se atualiza sozinho para versões novas; se ficar muito para trás o GitHub recusa jobs — veja "runner offline" na seção 8.

---

## 8. Solução de problemas

Comece sempre por **Administração → GitHub → Últimos eventos**: se o evento chegou, o problema é de regra; se não chegou, é de runner/workflow/rede.

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Job fica em *Queued* / "Waiting for a runner" | Runner offline ou sem a etiqueta `fila-atic` | Settings → Actions → Runners: precisa estar **Idle**. No servidor: `sudo /opt/actions-runner/svc.sh status`; logs: `journalctl -u 'actions.runner.*' -n 100`. Confira `--labels fila-atic` |
| Runner **Offline** | Serviço parado, servidor sem saída para o GitHub, versão muito antiga | `sudo ./svc.sh start`; teste `curl -I https://api.github.com`; veja proxy (Passo 3); se o log disser "runner version is too old", baixe a versão nova e refaça o `config.sh` (`./config.sh remove --token ...` antes) |
| Step "Tell Fila ATIC" falha com `FILA_ATIC_URL e FILA_ATIC_TOKEN` | Variável/segredo não configurados (ou com outro nome) | Passo 5 |
| `HTTP 401 Nao autorizado` | Token do GitHub ≠ token do `.env` | Copie de novo o mesmo valor nos dois; reinicie o sistema |
| `HTTP 503 GITHUB_INTEGRATION_TOKEN nao configurado` | Falta no `.env` ou o sistema não foi reiniciado | Passo 4.2 |
| `HTTP 403 Integracao desativada` | Caixa **Integração ativa** desmarcada | Passo 4.3 |
| `HTTP 400 Payload invalido` | Versão do script diferente da do sistema | Atualize o sistema e o repositório; a resposta traz o campo com problema |
| `ECONNREFUSED` / timeout ao avisar | `FILA_ATIC_URL` errada ou sistema fora do ar | `curl -I $FILA_ATIC_URL/login` no servidor |
| Evento aparece como **Ignorado — repositório não está na lista** | Nome diferente em "Repositórios aceitos" | Use exatamente `organização/repositório` |
| Evento **Ignorado — nenhum código de tarefa citado** | Mensagem/branch/PR sem `ATC-XXXX-N` | Cite o código (seção 4.2). O código do projeto sozinho não basta |
| Código aparece como **não encontrado** | Número da tarefa/projeto errado | Confira o código no cartão da tarefa |
| Commit registrado mas a tarefa não mudou de coluna | Regra do evento em "Não mover", tarefa já adiante (só avança) ou cancelada | Ajuste em Administração → GitHub; para permitir voltar, desmarque **Só avançar** |
| Deploy parado em "Waiting" | Aguardando aprovação do ambiente `production` | Review deployments → Approve |
| Deploy falhou em `git fetch` | O `origin` do clone não autentica | Refazer a chave/token de leitura (Passo 1.3); teste `sudo -u fila-atic git -C /opt/fila-atic fetch` |
| Deploy falhou em `npm ci`/build | Erro real do código, ou falta de acesso ao npm | Leia o log do job; o sistema já voltou para a versão anterior |
| `sudo: a password is required` no reinício | Regra do sudoers ausente ou com caminho diferente | Passo 1.7 (`which systemctl` mostra o caminho certo) |
| "o sistema não voltou a responder a tempo" | Falha ao subir (variável de ambiente, migration, porta) | `journalctl -u fila-atic -n 100`; o deploy já restaurou a versão anterior |
| Deploy ok, mas as tarefas não foram para **Publicado** | O step de aviso é `continue-on-error` (não derruba o deploy) | Veja o log do step "Tell Fila ATIC the deploy went well" e os eventos na tela |

**Reprocessar um evento perdido:** um job que ficou muito tempo sem runner pode expirar (o GitHub descarta jobs na fila por ~24 h). Refaça pelo botão **Re-run** do workflow, ou apenas faça um novo commit citando a tarefa. Repetir uma entrega é seguro: o sistema reconhece o mesmo commit/PR/deploy e não duplica nada.

---

## 9. Referência

### 9.1 Variáveis e segredos

| Onde | Nome | Uso |
|---|---|---|
| `.env` do sistema | `GITHUB_INTEGRATION_TOKEN` | Autoriza `POST /api/integrations/github` |
| GitHub Secret | `FILA_ATIC_TOKEN` | Mesmo valor; usado pelo `github-notify.mjs` |
| GitHub Variable | `FILA_ATIC_URL` | Endereço do sistema visto do runner |
| GitHub Variable | `FILA_ATIC_APP_DIR` | Pasta da aplicação (deploy) |
| GitHub Variable | `FILA_ATIC_RESTART_CMD` | Comando de reinício (deploy) |
| GitHub Variable | `FILA_ATIC_HEALTH_URL` | Verificação de saúde (padrão `http://localhost:3003/login`) |
| GitHub Variable | `FILA_ATIC_BACKUP_CMD` | Backup antes das migrations (opcional) |
| GitHub Variable | `FILA_ATIC_HEALTH_WAIT` | (opcional) Segundos de espera pelo sistema depois do reinício (padrão 90) |

### 9.2 Arquivos do repositório

| Arquivo | Função |
|---|---|
| `.github/workflows/ci.yml` | Lint, tipos, testes, build (runners do GitHub) |
| `.github/workflows/fila-atic-sync.yml` | Avisa o sistema de push/PR (runner do servidor) |
| `.github/workflows/deploy.yml` | Deploy com regras (runner do servidor) |
| `scripts/github-notify.mjs` | Monta o aviso a partir do evento do GitHub e envia (com nova tentativa) |
| `scripts/deploy.mjs` | Executa o deploy e o retorno; também roda à mão no servidor |
| `app/api/integrations/github/route.ts` | Recebe os avisos |
| `lib/githubSync.ts`, `lib/githubRules.ts` | Acham as tarefas pelos códigos e aplicam as regras |

### 9.3 Formato do aviso (para depurar com `curl`)

```bash
curl -sS -X POST "$FILA_ATIC_URL/api/integrations/github" \
  -H "authorization: Bearer $FILA_ATIC_TOKEN" -H "content-type: application/json" \
  -d '{"event":"push","repository":"smdu-sp/fila-atic","branch":"feature/x",
       "commits":[{"sha":"abcdef1234567","message":"feat: x (ATC-0001-3)","author":"fulana"}]}'
```

Eventos aceitos: `ping`, `push` (`branch`, `commits[]`), `pull_request` (`state`: `opened|merged|closed`, `number`, `title`, `body`, `branch`), `deploy` (`status`: `success|failure`, `environment`, `branch`, `commits[]`). Resposta: `{"ok":true,"outcome":"processed|ignored","summary":"...","tasks":[{"code":"ATC-0001-3","action":"moved|linked|duplicate|not_found"}]}`.

### 9.4 Desinstalar o runner

```bash
cd /opt/actions-runner
sudo ./svc.sh stop && sudo ./svc.sh uninstall
sudo -u fila-atic ./config.sh remove --token <TOKEN_DE_REMOÇÃO_DA_PÁGINA_DO_GITHUB>
```

Depois apague as variáveis/segredos do repositório e a linha do `sudoers`.

---

## 10. Perguntas frequentes

**Preciso registrar um runner por repositório?** Não: registrado na **organização**, o mesmo runner atende todos os repositórios dela (se você restringir por *runner group*, inclua o repositório).

**E pull requests de gente de fora (forks)?** O repositório é privado, então não há forks externos. Mesmo assim, o workflow de aviso usa `pull_request_target`, que não executa código do PR.

**Um commit sem código de tarefa dá problema?** Nenhum: aparece como *Ignorado — nenhum código de tarefa citado* nos eventos e nada muda.

**Posso desligar a integração temporariamente?** Sim: desmarque **Integração ativa** na tela. O runner continua enviando, o sistema responde 403 e nada é gravado (o deploy não é afetado).

**O que acontece se o servidor ficar fora do ar durante um push?** O job espera o runner voltar (até ~24 h). Passado esse tempo, use *Re-run* ou faça um novo commit.

**Onde vejo o que o sistema fez?** Na própria tarefa (seção **GitHub**), em **Administração → GitHub → Últimos eventos** e nos **Logs** do projeto (autor "GitHub", mostrando a coluna de origem e de destino).
