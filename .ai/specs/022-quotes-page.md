# 022 — Página de cotações em Posições

Estado: concluída em 2026-10-02; questões respondidas na
[spec 028](028-quote-rules.md)
Definida em: 2026-10-02

## Problema

Pedidos do usuário em 2026-10-02, registrados em
[Reestruturação da UX](../context/ux-restructure.md), em "Ajustes pedidos em
2026-10-02, antes da previdência":

- "a aba que ttemos hj acessada pela configuracxao de 'Atualização' eh legal
  termos dentro da propria posição como temos já hoje em 'Cotações do mês',
  poderiamos ter tudo numa mesma pagina e acessada direto por um botão
  existente em posição.";
- "Remover pagina de 'revisao de dados' Ex: 31 achados, sem correções
  silenciosas; Dados da carteira; Origem da carga inicial e preparação da
  próxima competência."

Resposta do usuário no mesmo dia: a página é única; um botão em Posições abre
as cotações do mês, editáveis, a última atualização, o botão de atualizar e o
histórico de execuções, e o painel recolhível sai da tabela.

Fatos observados no código antes da mudança:

- `/atualizacao` mostrava a última execução de "Atualizar carteira" da
  [spec 003](003-manual-monthly-update.md), com o resultado por símbolo e o
  botão para repetir; `/atualizacao/[id]` mostrava uma execução. Só se chegava
  a ela pelo bloco "Dados da carteira" da configuração;
- o botão "Atualizar carteira" também aparecia no cabeçalho da Visão Geral na
  competência mais recente que não fosse rascunho;
- as cotações da competência ficavam num painel recolhível acima da tabela de
  Posições, editável só no modo de edição da
  [spec 019](019-pencil-edit-mode.md), com um botão de salvar próprio;
- `/importacao`, "Revisão de dados", listava os achados da importação do
  Excel, com o título "N achados, sem correções silenciosas"; era aberta pela
  configuração e pelo aviso da Visão Geral sem posições;
- as execuções da atualização de cotações da [spec 020](020-daily-quotes.md)
  não tinham tela; só o topo mostrava a última.

## Objetivo

Uma página de cotações dentro de Posições que reúna, para a competência
selecionada, as cotações editáveis, a última atualização com o botão de
atualizar e o histórico das execuções, e retirar as telas e o fluxo antigos.

## Comportamento

### Acesso

- o cabeçalho de Posições tem o botão "Cotações", ao lado de "Editar
  posições" e com o mesmo visual; ele abre `/posicoes/cotacoes`, levando o
  `?mes` da URL quando houver;
- na página, a aba Posições continua ativa, o seletor global troca a
  competência e "← Posições", no lugar do sobretítulo, volta para a tabela no
  mesmo mês; com alterações pendentes, pede a mesma confirmação das abas;
- o botão some durante o modo de edição de posições, como os demais botões do
  cabeçalho.

### Última atualização

- um bloco abaixo do cabeçalho mostra a última atualização com o mesmo texto
  do topo ("Atualizado há 5 min", "Atualizado às 14:05"…), a data e a hora
  completas e, se a última tentativa falhou, os símbolos com falha;
- o texto informa o alcance: a atualização busca as cotações de hoje e
  recalcula as posições da competência do mês corrente; numa competência
  passada, avisa que as cotações dela só mudam pela edição;
- "Atualizar cotações" usa o mesmo cliente da seta do topo: os dois giram
  juntos, ficam ocupados sem perder o foco, e os avisos são os da spec 020,
  com o ativo, o provedor e o motivo de cada falha;
- ao terminar qualquer execução, inclusive uma que só falhou, a página
  recarrega o histórico e o último resultado de cada cotação, exceto quando
  há edições pendentes.

### Cotações do mês

- cada linha mostra o símbolo e o tipo (Cripto, ETF, Moeda), os ativos da
  competência que usam a cotação e o número de posições, o valor em reais com
  até oito casas, a origem, o total das posições daquele símbolo e o último
  resultado da atualização;
- a origem é "Repetida de Set/26" quando a cotação foi copiada de outra
  competência (`carried_from`, [spec 021](021-automatic-month-rollover.md)),
  "Cotação de 02/10/2026" quando veio do histórico diário (`quote_date`),
  "Valor do mês" para valores importados do Excel ou editados à mão e "Sem
  valor no mês" quando a competência não tem cotação para um símbolo em uso;
- o último resultado é o mais recente do símbolo entre as execuções da
  competência: "Atualizada em …" com o provedor ou "Falhou em …" com o
  provedor e o motivo; sem execução no mês, "—";
- o título do painel conta os símbolos, as cotações repetidas, as que
  falharam na última atualização e as alteradas na edição;
- no celular aparecem a cotação e o valor; a origem e o último resultado
  descem para baixo do símbolo, e o total das posições aparece sob o valor
  quando uma edição o altera. A tabela cabe no painel a partir de 320 px, em
  leitura e em edição.

### Edição

- "Editar cotações", com o lápis, segue a spec 019: na competência mais
  recente entra direto; numa passada abre a confirmação de que o histórico
  será alterado, e os avisos de competência travada e de edição do histórico
  são os de Posições;
- todos os valores viram campos de uma vez; Enter e as setas passam para a
  linha seguinte ou anterior;
- um valor que não é número, é zero ou tem mais de oito casas fica marcado,
  é contado na barra inferior e bloqueia o salvamento, inclusive numa cotação
  "Sem valor no mês";
- enquanto se digita, a linha mostra o valor anterior e o total das posições
  daquele símbolo recalculado, e o cabeçalho mostra o patrimônio do mês e o
  valor em dólar com as cotações digitadas;
- a barra inferior é a de Posições: contagem, "Descartar" ou "Sair da edição"
  e "Salvar". Salvar usa a ação de cotações da
  [spec 017](017-positions-editing.md), numa transação: grava as cotações,
  recalcula as posições, atualiza o câmbio quando o dólar muda, limpa a marca
  de repetida e o dia da cotação; sai da edição e mostra o aviso com
  desfazer;
- na competência do mês corrente, a edição avisa que a próxima atualização de
  cotações substitui o valor editado;
- trocar de competência sai da edição; trocar de aba, voltar por "← Posições"
  ou fechar a página com alterações pendentes pede confirmação.

### Histórico de execuções

- lista as execuções da spec 020 da competência, da mais recente para a mais
  antiga, até 30, com o total do mês;
- cada execução mostra data e hora, a origem (Automática ou Manual), a
  situação (Concluída, Com falhas, Falhou, Em andamento) e um resumo; as que
  têm falhas abrem a lista de ativos com o provedor e o motivo;
- a execução de "Atualizar carteira" da spec 003 que criou ou atualizou a
  competência aparece em leitura, marcada como "Fluxo anterior", com a data e
  a hora em que terminou a última tentativa; quando teve falha, o resumo diz
  que nenhuma cotação foi aplicada, porque aquele fluxo aplicava tudo ou nada;
  se ficou parada no meio, aparece como "Interrompida", com "Interrompida
  antes de terminar; nenhuma cotação foi aplicada.";
- sem execuções, "Nenhuma atualização de cotações registrada neste mês.".

### O que saiu

- o painel recolhível "Cotações do mês" da tabela de Posições;
- `/atualizacao` e `/atualizacao/[id]`, o botão "Atualizar carteira", também
  do cabeçalho da Visão Geral, a ação e o código de servidor desse fluxo;
- `/importacao`, "Revisão de dados", e o módulo `src/modules/imports`;
- o bloco "Dados da carteira" da configuração, com os links "Revisão de
  dados" e "Atualização";
- o link "Revisar dados de origem" da Visão Geral sem posições;
- quem abrir um endereço antigo é levado à tela atual: `/atualizacao` vai
  para `/posicoes/cotacoes` e `/importacao` para a Visão Geral, mantendo a
  query.

## Decisões tomadas

- "acessada direto por um botão existente em posição" foi entendido como um
  botão que fica em Posições: não havia botão de cotações, então "Cotações"
  foi criado no cabeçalho, ao lado de "Editar posições", e a página é uma rota
  filha de `/posicoes`, com a aba Posições ativa;
- "como temos já hoje em 'Cotações do mês'": a edição das cotações saiu do
  painel e foi para a página, no modo de edição da spec 019, no lugar do
  botão de salvar próprio do painel. O servidor, a regra de confirmação de
  histórico e o desfazer da spec 017 não mudaram;
- toda a página responde à competência selecionada. O histórico e o último
  resultado por cotação usam as execuções cujo dia de consulta cai no mês da
  competência, porque só nesse mês uma execução pode ter recalculado aquela
  competência. O dia da consulta foi preferido ao vínculo com a competência
  porque uma execução que falhou ao gravar fica sem esse vínculo e precisa
  aparecer. Em competências passadas sem execuções o histórico fica vazio;
- a última atualização do bloco é a mesma do topo, global, porque toda
  atualização grava o dia de hoje e recalcula só o mês corrente; o texto do
  bloco diz isso;
- a execução antiga de "Atualizar carteira" aparece em leitura no histórico
  para não perder o registro de onde vieram as cotações de rascunhos criados
  por ela; nas specs 003 e 017 há registro de execuções em outubro de 2026 no
  banco do usuário. Ela não entra no último resultado por cotação, que
  considera só a atualização da spec 020;
- o código do fluxo da spec 003 foi apagado: a atualização, a criação do
  rascunho, a leitura da execução, a ação e as telas. As tabelas
  `monthly_update_runs` e `quote_update_results`, os modelos do Prisma e as
  migrações ficaram. `currentReferenceMonth` passou para
  `src/modules/quotes/domain/calendar.ts`. A criação do mês fica com a virada
  da spec 021 e o clone da spec 017, e as cotações com a spec 020;
- com isso deixa de existir a aplicação "tudo ou nada": a regra da spec 020,
  de cada símbolo independente, é a única, e continua como questão em aberto
  daquela spec;
- a revisão da importação foi apagada com a rota e o módulo de interface. Os
  scripts de importação e normalização, as tabelas `import_batches`,
  `import_source_rows` e `import_issues` e os dados ficaram, como trilha de
  auditoria consultável no banco;
- os redirecionamentos ficam em `next.config.ts` e são temporários (307), para
  o navegador não guardar o desvio caso um desses endereços volte a ser usado;
- recarga: a página assina um aviso de execução terminada no cliente
  compartilhado da spec 020. O topo continua recarregando só quando alguma
  cotação foi gravada; pedidos do topo e da página no mesmo ciclo viram um
  único recarregamento;
- o estado da seta do topo foi extraído para `useQuoteRefresh`, usado pelo
  topo e pelo bloco da página, para os dois mostrarem o mesmo horário e o
  mesmo andamento;
- os horários das execuções usam o fuso do navegador e aparecem depois da
  hidratação, como o topo; o dia da cotação é uma data do banco e é mostrado
  sem fuso;
- "Valor do mês" cobre importadas e editadas à mão porque o banco não
  distingue as duas: ambas têm `quote_date` e `carried_from` nulos;
- os campos e os valores mostram até oito casas, a precisão gravada, e a
  vírgula decimal, como o resto da interface;
- `listQuoteRefreshRuns`, deixada pela spec 020 para esta página, foi
  removida sem uso: a página lê as execuções do mês numa consulta só, com os
  nomes dos ativos da própria competência;
- o diálogo de confirmação de histórico ganhou um rótulo configurável, para
  dizer "Editar cotações" nesta página;
- o aviso de competências criadas com cotações repetidas passou a indicar o
  botão Cotações em Posições;
- testes: o primeiro cenário de `tests/e2e/home.spec.ts` deixou de visitar as
  páginas removidas; os cenários novos ficam em
  `tests/e2e/quotes-page.spec.ts`, com a checagem de abertura simulada e
  edições sempre descartadas.

Correções da revisão, em 2026-10-02:

- "← Posições" chama a mesma confirmação das abas, do deslize e da linha do
  tempo, porque a navegação no cliente não dispara o aviso do navegador. O
  link continua visível na edição, como as abas, e ganhou o nome acessível
  "Voltar para Posições", que contém o texto visível;
- numa cotação "Sem valor no mês", qualquer texto digitado conta como
  alteração, para que a regra de valor inválido se aplique em vez de o texto
  ser ignorado ao salvar;
- a execução antiga é datada e ordenada pelo fim da última tentativa
  (`completed_at`, ou o início quando não há fim), porque cada nova tentativa
  daquele fluxo substituía os resultados e mantinha o início da primeira. Uma
  execução antiga que ficou `RUNNING` aparece como "Interrompida": o código
  que a encerrava foi apagado, e aquele fluxo gravava cotações e posições
  numa transação só, no fim, então nada chegou às posições. Uma execução
  `RUNNING` da spec 020 continua "Em andamento", porque a próxima execução
  encerra as presas;
- o resumo da última atualização é lido uma vez por pedido, com o `cache` do
  React, e compartilhado entre o topo e o bloco da página
  (`getRequestQuoteRefreshSummary`); as rotas de API continuam lendo direto;
- em 320 px, o campo de valor tem no mínimo 104 px abaixo de `sm`, a célula
  do valor usa `px-3`, o tipo do símbolo pode descer de linha, o motivo da
  falha quebra em qualquer ponto (termos como `ALPHA_VANTAGE_API_KEY`) e as
  linhas "antes" e "posições" sob o campo podem quebrar no celular.

## Fora do escopo

- padronizar símbolos e fontes, incluindo o ativo "Solana" com ticker USD;
- proteger uma cotação editada à mão da próxima atualização, questão aberta
  da spec 020;
- buscar cotações históricas nos provedores;
- gráfico do histórico diário de um ativo:
  [spec 016](016-position-history.md);
- cotações de ativos novos: spec 026;
- paginação do histórico além das 30 execuções mais recentes do mês;
- Previdência.

## Critérios de aceite

- Posições tem o botão "Cotações", e o painel recolhível saiu da tabela;
- a página mostra, para a competência selecionada, cada cotação com os
  ativos, o valor, a origem, o total das posições e o último resultado,
  inclusive falhas;
- a edição segue o lápis da spec 019, pede confirmação em competência
  passada, bloqueia valor inválido, recalcula as posições ao salvar e permite
  desfazer;
- o botão da página e a seta do topo atualizam juntos, e as falhas viram
  avisos com o ativo;
- o histórico lista as execuções da competência e a execução antiga em
  leitura;
- `/atualizacao`, `/importacao` e o bloco "Dados da carteira" não existem
  mais, e os endereços antigos levam às telas atuais;
- lint, tipos, build e testes de interface passam.

## Verificação

Num banco descartável criado pelas migrações e carregado com a importação e
as normalizações do Excel, com setembro de 2026 como competência mais recente
e um servidor próprio na porta 3210:

- abrir a página sem simulação criou outubro pela virada, passou para
  outubro, mostrou os avisos da competência criada e das 10 cotações com
  falha, e o histórico passou a ter 1 execução automática com falha; sem rede
  para os provedores, as respostas foram HTTP 403 e a falta da chave do Alpha
  Vantage;
- o botão da página rodou a atualização real, que falhou de novo, e o
  histórico passou para 2 execuções sem recarregar a página à mão;
- BTC editado para 400.000,50 em outubro gravou o valor com `quote_date` e
  `carried_from` nulos, e as duas posições de bitcoin ficaram com preço
  400.000,50 e total igual à quantidade vezes a cotação, em centavos
  (R$ 120.181,25 e R$ 2.442,82); "Desfazer" devolveu 395.046, a marca de
  repetida de setembro e os totais anteriores;
- em setembro, competência passada, a edição pediu confirmação; o dólar 5,20
  gravou a cotação e o câmbio das 21 posições com câmbio, sem tocar outubro;
  "Desfazer" devolveu 5,1084;
- uma execução antiga de "Atualizar carteira" inserida para setembro, com uma
  falha em três cotações, apareceu como "Fluxo anterior" e "1 cotação com
  falha de 3; nenhuma foi aplicada.", com o ativo e o motivo ao abrir;
- uma execução com BTC atualizado e VOO com falha mostrou "Atualizada em …"
  com CoinGecko no BTC e o tempo limite do Finnhub no VOO, enquanto os demais
  símbolos mantiveram o resultado da execução anterior.

O banco descartável foi removido ao final. As chamadas reais aos provedores
não puderam ser verificadas neste ambiente, que não alcança a rede deles; o
caminho de sucesso foi conferido com execuções gravadas à mão e com as rotas
simuladas.

`/atualizacao`, `/atualizacao/abc?mes=2026-09` e `/importacao` responderam
307 para `/posicoes/cotacoes`, `/posicoes/cotacoes?mes=2026-09` e `/`.

As capturas da página, da edição, do histórico aberto, da atualização em
andamento e concluída, de agosto de 2026, do cabeçalho de Posições, da
configuração e da Visão Geral foram conferidas no computador e no Pixel 7.

`tests/e2e/quotes-page.spec.ts` cobre, sem gravar: o botão de Posições, a aba
ativa e a volta mantendo o mês; a prévia, o valor inválido e o descarte; a
confirmação em competência passada e o histórico vazio de agosto de 2026; a
atualização pela página com o topo girando junto, o aviso com os ativos e o
bloco atualizado; e os endereços antigos. `pnpm lint`, `pnpm typecheck` e
`pnpm build` passaram. A suíte completa do Playwright, nos perfis de
computador e Pixel 7, teve 95 cenários aprovados e 3 pulados, os mesmos pulos
por perfil que as specs 025 e 027 já tinham. Depois da suíte, o banco local
continuava com a mesma execução de cotações e as mesmas 32 competências.

Correções da revisão, em 2026-10-02, num banco descartável carregado do mesmo
jeito, com setembro de 2026 como competência mais recente, a checagem de
abertura simulada, o navegador em UTC e um servidor próprio na porta 3210:

- uma execução antiga de setembro gravada como `RUNNING`, iniciada em
  01/09/2026 às 10:00 e com uma falha em três cotações, apareceu como
  "Interrompida", "Interrompida antes de terminar; nenhuma cotação foi
  aplicada." e "Fluxo anterior", abaixo de uma execução da spec 020 de
  10/09/2026, e abriu o VOO com o motivo; a mesma execução com
  `COMPLETED_WITH_ISSUES` e fim em 15/09/2026 às 20:18 passou a mostrar esse
  horário, "Com falhas" e "1 cotação com falha de 3; nenhuma foi aplicada.",
  e subiu para o topo da lista;
- sem a cotação de VOO em setembro, a linha mostrou "Sem valor no mês";
  "abc" no campo ficou marcado e contado como "1 valor inválido", e "Salvar"
  ficou bloqueado mesmo com o BTC alterado; depois de descartar, 3.600,50
  criou a cotação e recalculou a posição para 2,806 × 3.600,50 = R$
  10.103,00.

O banco descartável foi removido. No banco local, com um registro temporário
na leitura do resumo, retirado em seguida, um pedido à página de cotações e
um a Posições leram o resumo uma vez cada. Medida a tabela de outubro e de
setembro em 320, 360 e 412 px, em leitura e com o BTC editado, a largura da
tabela ficou igual à do painel; antes, em 320 px, eram 361 px em 278 em
edição e 333 px em leitura, por causa de `ALPHA_VANTAGE_API_KEY` e da linha
"posições" sob o campo. As capturas da tabela em leitura e em edição, com um
valor válido e um inválido, foram conferidas no computador, no Pixel 7 e em
320 px, e as do histórico com a execução antiga, no computador.

`tests/e2e/quotes-page.spec.ts` passou a clicar no próprio "← Posições" e
ganhou o cenário em que a volta com uma edição pendente pede confirmação:
cancelar mantém a página e o valor digitado, e aceitar volta para a tabela
sem gravar. Sem a confirmação no link, esse cenário falha. `pnpm lint`,
`pnpm typecheck` e `pnpm build` passaram, e a suíte completa do Playwright,
nos perfis de computador e Pixel 7, teve 97 cenários aprovados e os mesmos 3
pulados. Depois da suíte, o banco local continuava com 32 competências, 1
execução de cotações e o BTC de outubro em 395.046.

## Questões em aberto

Respondidas pelo usuário em 2026-10-02 (segunda rodada) e implementadas na
[spec 028](028-quote-rules.md):

- o botão "Cotações" no cabeçalho de Posições está correto;
- o histórico mostra todas as execuções, de qualquer mês, dos últimos 36
  meses;
- os endereços antigos foram removidos;
- edição restrita às cotações não encontradas ou com falha.

Aguardando explicação ao usuário: a execução antiga de "Atualizar carteira"
continua visível no histórico, marcada como "Fluxo anterior". Ela é o registro
da atualização mensal da spec 003, que buscava as cotações e criava o mês num
botão só; foi substituída pelas specs 020 e 021.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Atualização mensal manual](003-manual-monthly-update.md)
- [Posições: edição](017-positions-editing.md)
- [Modo de edição com lápis](019-pencil-edit-mode.md)
- [Cotações diárias e atualização ao abrir](020-daily-quotes.md)
- [Virada de mês automática](021-automatic-month-rollover.md)
