# Diário de desenvolvimento — Fila ATIC

Registro de decisões e entregas do projeto: o que foi pedido, o que foi feito e por quê. Não substitui o `git log` (que tem o detalhe técnico de cada commit) nem o `README.md` (que descreve o sistema como ele é hoje); serve para explicar o raciocínio por trás das mudanças, na ordem em que aconteceram. Entradas mais novas no topo.

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
