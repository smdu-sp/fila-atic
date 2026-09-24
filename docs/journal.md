# Diário de desenvolvimento — Fila ATIC

Registro de decisões e entregas do projeto: o que foi pedido, o que foi feito e por quê. Não substitui o `git log` (que tem o detalhe técnico de cada commit) nem o `README.md` (que descreve o sistema como ele é hoje); serve para explicar o raciocínio por trás das mudanças, na ordem em que aconteceram. Entradas mais novas no topo.

## 2026-09-25 (continuação) — Diálogos de tarefa: de novo diferentes e cortados

O usuário reportou que o diálogo "Nova tarefa" voltou a ser diferente do de edição e que o de edição estava com o conteúdo cortado na horizontal. Medi no Edge antes de mexer (a lição do bug da barra lateral), e eram dois problemas separados:

- **Tamanhos diferentes**: só o diálogo de edição usava `size="2xl"`; os de criação (Kanban e painel de tarefas do projeto) ficaram no tamanho padrão de 512px desde que unifiquei os campos em `TaskFormFields` — unifiquei o conteúdo, mas não a moldura. Agora os três usam `2xl`.
- **Conteúdo 97px mais largo que o diálogo**: mesma causa raiz da barra lateral do detalhe. Cada campo da coluna lateral era um `<div className="grid gap-1.5">`; um grid sem `grid-template-columns` tem coluna implícita `auto`, que não encolhe abaixo do conteúdo em uma linha, e o botão do "Responsável" (`whitespace-nowrap`, com o nome completo do desenvolvedor) impunha os ~361px. `minmax(0,1fr)` nos wrappers e nas duas colunas do `TaskFormFields`. O `SelectTrigger` também passou a deixar o valor encolher (`min-w-0`, `overflow-hidden`, `truncate`), para nomes longos não empurrarem nenhum select do sistema.

Medido depois em 1024, 1280 e 1656px: zero elementos fora dos diálogos, e criação/edição com a mesma largura. Por que só apareceu agora: o problema dependia do nome do responsável já selecionado — no diálogo de criação ("Sem responsável") não havia texto longo para estourar.

Regra para não repetir: todo `grid` que contém campos de formulário (selects, botões com texto variável) precisa de `grid-cols-[minmax(0,1fr)]`.

## 2026-09-25 — Fase 10: etiquetas com cor (paleta gerenciada)

Pedido original: "adicionar etiquetas personalizadas com cores personalizadas". Decisão tomada com o usuário na fase de planejamento: **paleta gerenciada** (estilo Jira/Linear) em vez de etiqueta livre — a coordenação cadastra nome + cor e os demais só escolhem. O motivo é o de sempre em texto livre: em pouco tempo aparecem "urgente", "Urgente", "URGENTE!!" e o filtro deixa de servir.

Como ficou:

- **Modelo**: nova tabela `Label` (nome único, cor `#rrggbb`). Decisão de projeto: `Task.labels` continua sendo `String[]` com o *nome* da etiqueta, em vez de virar tabela de junção. Assim as ~20 leituras existentes (Kanban, painel do projeto, listas, filtros, relatórios) não mudam; o custo é que renomear/excluir precisa reescrever os arrays — feito com `array_replace`/`array_remove` na mesma transação da alteração da paleta. Como o nome é único ignorando caixa, a grafia guardada nas tarefas é sempre a da paleta.
- **Migração com backfill**: as etiquetas livres que já existiam viram linhas da paleta (grafias que só diferem em maiúsculas/minúsculas são unificadas; cores rotacionam por 8 tons) e as tarefas passam a guardar a grafia da paleta, na mesma ordem. Testei o SQL com dados legados misturados (`urgente`/`Urgente`/`API`/`api`) dentro de uma transação que desfiz no final.
- **Regras no servidor** (`lib/labelPalette.ts`): `createTask`/`updateTask` recusam etiqueta fora da paleta, com a mensagem apontando quais; o que vale é a grafia da paleta ("URGENTE" vira "Urgente"). Limites de 8 por tarefa e 30 caracteres continuam. Só coordenação/tech lead cria, altera e exclui etiquetas; qualquer perfil da equipe lê a paleta; solicitantes não.
- **Interface**: página **Administração → Etiquetas** (criar com prévia, trocar nome/cor, excluir com aviso de quantas tarefas perdem a etiqueta e contagem de uso). `LabelsInput` deixou de ser campo de texto e virou seletor da paleta (lista com filtro quando passa de 6 etiquetas), usado no diálogo da tarefa, no formulário de criar e no popover do cartão. Chips coloridos em todo lugar via `LabelChip`; a paleta chega aos componentes por um contexto (`LabelCatalogProvider`) em vez de prop em cada nível. O filtro de etiqueta do Kanban lista a paleta inteira, com a cor.
- **Testes**: 19 novos (unitários de cor/nome/casamento com a paleta; integração de permissões, duplicidade ignorando caixa, renomear carregando as tarefas, excluir limpando as tarefas, tarefa recusando etiqueta inventada). Os testes antigos que usavam etiqueta livre agora cadastram a paleta antes.

## 2026-09-25 (continuação) — Barra lateral do detalhe: causa real achada com um navegador de verdade

O usuário pediu para eu abrir o navegador e verificar. Não há ferramenta de navegador integrada aqui, mas o Edge está instalado: usei `puppeteer-core` (só o cliente, instalado fora do projeto) para renderizar a página, tirar print e medir cada elemento que passava da borda do pai. Isso resolveu em minutos o que três rodadas de suposições não resolveram.

Causa real: a barra lateral tinha 288px, mas os campos dentro dela estavam com 425px — exatamente a largura do nome completo do desenvolvedor em uma linha ("avatar + Thamyris Aparecida Souza Bareicha de Abreu + Remover"). Um `display: grid` sem `grid-template-columns` cria uma coluna implícita `auto`, e o mínimo de uma coluna `auto` é o conteúdo em uma linha; `truncate`/`min-w-0` nos filhos não impedem isso, porque não mexem no tamanho da *coluna* do pai. Correção: `grid-cols-[minmax(0,1fr)]` nos grids do bloco de controles e do formulário empilhado (`ProjectUpdateForm`, layout `stack`). Sobrou ainda o botão "Atribuir" empurrado para fora porque o `SelectTrigger` tem `shrink-0` embutido; ele agora usa `min-w-0 flex-1 shrink`.

Medido depois: zero elementos estourando em 931, 1024, 1280, 1440 e 1656px de largura. O `overflow-x-auto` que eu tinha posto como rede de segurança na rodada anterior foi removido — ele só escondia o problema e mascararia o próximo. O ponto de quebra `xl` da coluna lateral fica (em 1024px a coluna de 18rem ao lado do conteúdo ficaria apertada de qualquer jeito).

Lição para o futuro: para bug visual, medir no navegador antes de teorizar; e em grid com conteúdo de largura imprevisível (nomes), sempre `minmax(0,1fr)` explícito.

## 2026-09-25 (continuação) — Terceira tentativa no corte da barra lateral: parei de adivinhar

Segundo print do usuário, mesmo problema (nome de desenvolvedor cortado sem reticências, campos encostando na borda), mesmo depois da correção anterior. Sem um navegador de verdade para inspecionar, cheguei ao limite de deduzir a causa só lendo código e reagindo a prints — cada rodada corrigia uma hipótese plausível (e provavelmente real) sem garantia de ser a única.

Em vez de arriscar uma quarta hipótese, troquei de estratégia por duas frentes que não dependem de eu acertar a causa exata:

- **A coluna lateral fixa (antes 20rem) só existe a partir da tela `xl` (1280px) agora, não mais `lg` (1024px)**; abaixo disso, a barra lateral empilha embaixo do conteúdo principal, em largura total — nesse caso não existe "coluna estreita demais" para nada vazar.
- **`overflow-x-auto` no bloco de controles** (o que aparece nos prints): se sobrar alguma largura que os ajustes de `min-w-0` não peguem, agora ela vira uma barra de rolagem contida dentro do próprio bloco azul, em vez de vazar para a página inteira. Não é elegante, mas é a garantia de que, seja qual for a causa raiz, o resto da página para de quebrar por causa dela.

Registrando para não repetir o padrão: comentei no código do bloco de controles, com um exemplo de commit, para o próximo ajuste nessa área conferir o `overflow-x-auto` antes de assumir que sumiu.


## 2026-09-25 — Correção de verdade do corte na barra lateral do detalhe

O usuário mandou um print: a barra lateral do detalhe do projeto continuava cortada na borda direita da tela mesmo depois da correção anterior. Dessa vez consegui ver o problema de verdade (nome de desenvolvedor longo, "Thamyris Aparecida Souza Bareicha de Ab" cortado sem reticências) em vez de só suspeitar.

Causa raiz: `<Card>` e o bloco azul de controles são itens de um grid (`<aside className="grid ...">`) cuja coluna tem largura fixa (`20rem`). Uma coluna de grid com tamanho fixo não cresce, mas um item dentro dela sem `min-width: 0` também não encolhe — ele tenta ficar do tamanho do próprio conteúdo e simplesmente extrapola a célula, ficando visualmente cortado na borda da página. O `min-w-0` que já existia no `<aside>` e nos spans internos não ajudava, porque o `<Card>` e o `<div>` do bloco azul, no meio do caminho, não tinham o `min-w-0` deles. É a mesma classe de bug do modal de tarefa (`19365dd`) e da barra lateral do wiki, só que num lugar diferente da árvore.

Correção: `min-w-0` no componente `Card` (`components/ui/card.tsx`) — para valer em qualquer grid/flex do sistema todo, não só aqui — e no `<div>` do bloco azul de controles, que não é um `Card`. Testado que as outras páginas que colocam `Card` dentro de um grid (`/relatorios`, `/fila`, `/projetos`, `/kanban`, `/wiki`) continuam respondendo normalmente.


## 2026-09-24 (continuação) — Correção: detalhe do projeto não cabia e estava tudo cinza

Dois problemas relatados depois da fase 9, e os dois tinham a mesma raiz: eu troquei os antigos `<Card>` por `<div>` sem estilo ao reorganizar a página.

- **"Não está cabendo"**: nomes completos de desenvolvedores (bem longos, como é comum aqui) apareciam como badge/pill — e badge é `shrink-0` e `whitespace-nowrap` por definição, então um nome comprido simplesmente força a badge para fora da barra lateral de 20rem, que aí fica cortada pelo `overflow-x-hidden` da página (mesma classe de bug do modal de tarefa, semana passada: esconder overflow sem resolver a causa só troca "barra de rolagem" por "conteúdo sumindo"). Troquei as badges de equipe (na barra lateral e no painel de controle) por linhas com avatar, que quebram/truncam texto normalmente em vez de recusar encolher.
- **"Tudo cinza"**: a página não tinha o `bg-muted/50` (fundo cinza claro) que toda outra página do sistema usa, e os blocos que eu criei não tinham `bg-card` (branco) — e `--background` e `--card` são exatamente a mesma cor (branco) no tema, então sem esse fundo cinza por baixo, os blocos brancos ficavam invisíveis um do outro, só com uma borda fina cinza para separar. Voltei a usar o componente `<Card>` (que já tem fundo branco) nos blocos, adicionei o fundo cinza claro na página, e dei um tom azul claro (`bg-sky-50`) ao bloco de status/controles, a pedido, para destacar a área de ação principal.


## 2026-09-24 (continuação) — Fase 9: detalhe do projeto em estilo Jira

Escopo combinado antes de começar: reorganização visual reaproveitando o que já existe, sem recurso novo, mantendo o chat. Virou um layout de duas colunas — título, descrição, justificativa, campos adicionais, tarefas e o chat na coluna principal; status, prioridade, categoria, equipe, solicitante e datas numa barra lateral estreita e fixa (`sticky`), do mesmo jeito que o diálogo de tarefa (`TaskFormFields`) já fazia — mesma linguagem visual nos dois lugares agora. Nenhum dado novo, nenhuma ação nova: só reposicionamento.

No caminho, achei dois pontos mortos em `ProjectControls` que valem registrar (não mexi neles, só evitei repeti-los na variante nova): a variante `"card"` nunca era usada em lugar nenhum do sistema, e o ramo dela para quem gerencia projetos não desenhava o formulário de status/prioridade — ficaria faltando se algum dia alguém tentasse usar essa variante. A variante nova (`"sidebar"`) foi escrita do zero para não herdar esse buraco.


## 2026-09-24 — "Caderno" virou "Wiki"; reorganização por arrastar

Duas coisas pedidas juntas antes da fase 9:

- **Renomeado "Caderno" para "Wiki"** em tudo que o usuário vê: rota (`/caderno` → `/wiki`), menu lateral, títulos, textos, README. Os nomes internos (`NotebookPage`, `notebookActions.ts`, etc.) continuam em inglês como "Notebook" — mesmo critério já usado em "chamado" → "projeto": só o texto voltado à pessoa muda, não os identificadores internos. No caminho, um `mv`/`git mv` da pasta da rota falhou por permissão (o servidor de desenvolvimento do usuário estava rodando e segurando um handle na pasta); resolvido criando os arquivos no novo lugar e apagando os antigos um por um, em vez de renomear a pasta inteira.
- **Reorganização por arrastar** na árvore da wiki: soltar uma página perto do topo ou do fundo de outra a reordena como irmã dela (em qualquer pai — arrastar entre páginas de pais diferentes já move e reordena em um passo só); soltar no meio de uma página a torna subpágina dela. A ação `reorderNotebookPage` (criada na fase 8 mas nunca usada pela interface) ganhou um `parentId` opcional para isso, com a mesma checagem de ciclo já usada em `updateNotebookPage`.
- No caminho, um bug pequeno da fase 8: `refresh()` tentava revalidar uma rota aninhada (`/caderno/<id>`) que nunca existiu — a página sempre foi `/caderno?p=<id>`, um parâmetro de busca, não uma rota aninhada. Corrigido junto com a renomeação.

## 2026-09-23 (continuação) — Fase 8: caderno digital (wiki interna)

Pedido: um "caderno digital estilo Notion" para templates, informações de servidores etc. Perguntei a profundidade antes de começar; a resposta foi "wiki simples" — páginas de texto rico organizadas em pastas, com histórico de quem editou. Ficou assim:

- **Árvore de páginas**: `NotebookPage` com auto-relacionamento (`parentId`), qualquer página pode ter subpáginas, sem limite de profundidade. Nova posição de irmãos calculada como no Kanban (`position` fracionário); reordenar (`reorderNotebookPage`) já existe no backend, mas a interface de arrastar ficou fora desta primeira entrega — por enquanto uma página nova só entra no fim da lista de irmãos.
- **Conteúdo em Markdown**, não um editor de blocos: mais simples de implementar e de guardar, e já cobre título/lista/link/imagem/negrito, que era o pedido. Renderizado com `react-markdown` + `remark-gfm` (tabelas, listas de tarefas) e `@tailwindcss/typography` para o visual, sem precisar estilizar elemento por elemento.
- **Histórico leve**: `NotebookPageRevision` guarda quem editou e quando a cada mudança de título ou conteúdo — não guarda o conteúdo de cada versão (isso seria versionamento de verdade, escopo maior; se fizer falta, dá para evoluir depois).
- **Imagens inline**: reaproveitam `lib/uploads.ts` e a rota `/uploads/[name]` (mesmo padrão de anexos de tarefa e de mensagem); a imagem enviada vira `![nome](url)` direto no texto, no cursor. Apagar uma página apaga o arquivo de toda imagem da subárvore inteira, não só dela.
- **Permissão**: toda a equipe (coordenação, Tech Lead, DEV I, DEV II) lê e edita qualquer página — sem dono, de propósito, por ser um espaço coletivo. Solicitantes nunca veem `/caderno`. Novo helper `isStaffRole`/`STAFF_ROLES` em `lib/roles.ts` para esse padrão de permissão, que provavelmente vai reaparecer.
- Testado com 10 testes de integração (permissão, árvore, revisões, prevenção de ciclo ao mover uma página para dentro dela mesma, reordenação, exclusão em cascata com limpeza de arquivo, upload/remoção de imagem com controle de acesso) e um smoke test no build de produção.

## 2026-09-23 — Relatórios, edição rápida no Kanban, correções de modal

**Fase 6 do plano de gerenciador de projetos: relatórios.** A pedido, o escopo ficou em indicadores gerais (solicitações por status/prioridade/categoria, tempo médio por etapa, tarefas concluídas x em aberto) e desempenho por desenvolvedor (concluídas/em aberto/atrasadas), com filtro de período opcional — exportação em CSV foi deixada de fora por enquanto. Nova página `/relatorios` (coordenação e Tech Lead). O tempo por etapa usa o histórico de `ProjectStatusChange` e só conta etapas já concluídas dentro do período (a etapa atual de um projeto em andamento não entra na média, para não subestimar o tempo real). _(commit `74ec91c`)_

**Correção: seletor de responsável sumido no Kanban.** O diálogo de tarefa só mostrava o campo de responsável quando havia pelo menos um desenvolvedor na lista — e como o banco ainda não tinha nenhum DEV I/II ativo, o campo sumia até para quem gerencia. Trocado para depender do papel de quem está usando (`isManager`), não do tamanho da lista. Aproveitado para unificar o diálogo de criar tarefa com o de editar (mesmo componente de campos, `TaskFormFields`), incluindo um seletor de status que faltava na criação. _(commit `ddc6ddf`)_

**Edição rápida no card do Kanban, estilo Trello.** Clicar no título, no ícone de prioridade, nas etiquetas ou na bolinha do responsável edita ali mesmo, sem abrir o card inteiro — a bolinha só é clicável para quem gerencia projetos (mesma regra do diálogo completo); o resto, para quem é responsável pela tarefa ou gerencia. _(commit `78e6035`)_

**Modal de tarefa cortando conteúdo.** Duas rodadas: a primeira tentativa (esconder a rolagem horizontal do diálogo) só trocou "aparece uma barra de rolagem incômoda" por "o conteúdo simplesmente some", porque a causa real não tinha sido corrigida — uma etiqueta longa sem como encolher (faltava `min-width: 0` no texto dentro do chip) empurrava a coluna lateral do formulário para fora. Corrigido o componente de etiquetas, e como reforço: novo tamanho `2xl` de diálogo, a divisão em duas colunas do formulário de tarefa só ativa em telas realmente largas, e a barra de anexos pode quebrar linha em vez de forçar largura. Lição: esconder overflow sem achar a causa só troca de sintoma. _(commits `526d017` e o `overflow-x-hidden` em `19365dd`/turno anterior)_

**Início deste diário**, a pedido — este arquivo. Junto, uma leva de ajustes menores pedidos na mesma mensagem:

- **"Chamado" virou "projeto"** em todo texto voltado ao usuário (mensagens de erro, títulos de página, README). Terminologia interna (nomes de tabela, variáveis) não foi tocada.
- **Código do projeto (`ATC-0001`)**: coluna `Project.code`, sequencial e permanente (nunca reaproveitado, mesmo excluindo o projeto), atribuído na criação. A migration numera os projetos já existentes pela ordem real de criação (`createdAt`) — deixar o Postgres numerar pela ordem física das linhas na tabela teria sido errado, porque projetos editados muitas vezes (como os desta base) não ficam fisicamente na ordem em que foram criados. Um detalhe pego pelos testes antes de ir para produção: `setval` não aceita valor 0, então a mesma migration numa base vazia (uma instalação nova) quebraria; corrigido antes de aplicar em qualquer lugar. Aparece agora em `/projetos`, `/fila`, no card do Kanban e no detalhe do projeto.
- **Bolinha de notificação removida** do sino, a pedido (ficou só o ícone; o contador por item dentro do menu continua).
- **Modal de editar projeto**: passou a permitir editar título e descrição (o backend já aceitava, a tela nunca expôs os campos).
- **CI**: `.github/workflows/ci.yml` — lint, checagem de tipos, testes (com Postgres descartável) e build em todo push em `main` e toda pull request. CD (deploy automático) fica para quando as regras e o ambiente de hospedagem forem definidos com o usuário.

## 2026-09-18 — De base de desenvolvimento a gerenciador de projetos usável

Sessão longa: varredura inicial do projeto, correção dos problemas encontrados e execução de um plano de 6 fases (aprovado pelo usuário) para o sistema deixar de ser só uma fila de chamados e virar um gerenciador de projetos usável — tarefas de verdade ligadas a projetos, prazos, notificações, ciclo de vida completo da solicitação e um Kanban à altura do Jira/Trello.

**Correções da varredura inicial:** título "Fila Atic" e favicon (ícone azul no modo claro), commits sem o trailer `Co-Authored-By` (preferência do usuário, guardada em memória).

**Solicitação pública sem conta.** Formulário público protegido contra spam (limite por IP/e-mail, honeypot, domínios institucionais permitidos), solicitante convidado (`User.isGuest`), link de acompanhamento com token, e-mail de confirmação. Explicado ao usuário por que `/projetos` e `/logs` não precisam ficar abertos a solicitantes (eles só acompanham a própria solicitação, não o backlog inteiro).

**Kanban redesenhado** em estilo mais parecido com Jira: colunas, cartões, avatares consistentes por pessoa. _(commit `038f74c`)_

**Fase 0 — base:** seed do primeiro coordenador, `.env.example`, suíte de testes automatizados (Vitest contra um banco `_test` dedicado, nunca o de desenvolvimento).

**Fase 1 — tarefas ligadas a projetos de verdade:** histórico de status do projeto, equipe do projeto, regra de não fechar um projeto com tarefas em aberto sem confirmar. Corrigido um erro do Prisma ao arrastar um projeto para "Finalizado" (`notIn` recebendo `undefined`), e o agrupamento "Equipe do projeto" que aparecia no seletor sem ser clicável.

**Fase 2 — prazos e busca:** previsão de entrega em projetos e tarefas, busca com filtros e paginação nas listas, selos de prazo (`DueBadge`). Aproveitado o pedido para deixar o espaçamento dos modais e diálogos consistente em todo o sistema. _(commits `3798a15`, `f5b1cd8`, `4737a31`)_

**Papel Tech Lead:** mesmo conjunto de permissões do coordenador — toda checagem que antes testava `Role.COORDINATOR` direto passou a usar `COORDINATION_ROLES`/`isCoordination` (19 arquivos), para os dois papéis nunca ficarem dessincronizados. _(commit `e6174c6`)_

**Fase 3 — notificações:** sino na barra lateral (depois movido para o canto superior direito da área de conteúdo, a pedido), página `/notificacoes`, preferência de e-mail por pessoa, aviso diário de prazos vencendo (rota `/api/cron/deadline-reminders` protegida por segredo). Quem causa o evento nunca é avisado dele. _(commits `b14a793`, `f77b7fa`, `068631b`)_

**Fase 4 — ciclo de vida da solicitação:** cancelar, recusar e reabrir (com motivo e janela de 30 dias), anexos já na abertura do formulário, reenvio do link de acompanhamento para quem perdeu o e-mail. _(commits `bcf537b`, `4015c0a`)_

**Fase 5 — tarefas completas e Kanban:** prioridade e etiquetas em tarefas, posição manual dos cards dentro da coluna (arrastar para reordenar), comentários e anexos de tarefa (trabalho interno — solicitante nunca vê), categoria da solicitação (erro, melhoria, sistema novo, suporte, outro) com filtro em `/fila` e `/projetos`. No caminho, achado e corrigido um bug antigo: o proxy do Next corta o corpo da requisição em 10 MB por padrão, quebrando envio de vários arquivos. _(commits `80c9a01`, `212ec94`, `19365dd`)_

## Antes disso

Bootstrap do projeto (Next.js, Prisma, Tailwind), autenticação contra LDAP com papéis no banco, e as páginas e ações originais (dashboard, fila, projetos, solicitações, Kanban, logs, usuários) — trabalho anterior a esta sessão, não coberto por este diário.
