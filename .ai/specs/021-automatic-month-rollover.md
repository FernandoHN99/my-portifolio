# 021 — Virada de mês automática

Estado: concluída em 2026-10-02; as propostas em "Questões em aberto"
aguardam o usuário
Definida em: 2026-10-02

## Problema

A competência de um mês novo só existia quando o usuário clicava em
"Atualizar carteira" ([spec 003](003-manual-monthly-update.md)) ou em clonar o
mês anterior ([spec 017](017-positions-editing.md)). A spec 003 também proibia
preencher meses intermediários sem confirmação. Em 2026-10-02 o usuário
decidiu que a virada de mês é um processo próprio e automático, separado da
atualização de cotações. As decisões estão em
[Reestruturação da UX](../context/ux-restructure.md), em "Atualização: são
dois processos distintos".

## Objetivo

Ao abrir o aplicativo, garantir que exista a competência do mês corrente,
criando todas as que faltarem depois da mais recente, cada uma copiada da
anterior.

## Comportamento

- a checagem de abertura da [spec 020](020-daily-quotes.md) roda primeiro a
  virada de mês e depois as cotações;
- se a competência do mês corrente já existe, nada acontece;
- se não existe, cada mês entre a competência mais recente e o mês corrente é
  criado em ordem, copiando o mês anterior: posições com quantidade, preço,
  câmbio, total e estratégia, rateios e cotações do mês. As competências
  criadas ficam como rascunho, como no clone;
- a cotação de cada competência gerada é a do último dia daquele mês
  disponível no histórico diário; para o mês corrente, a última disponível até
  hoje. Sem cotação diária dentro do mês, a competência repete a cotação do
  mês anterior;
- uma posição cuja cotação veio do histórico do mês é reprecificada pela
  quantidade vezes a cotação; com cotação repetida, preço e total são
  copiados como estão. O câmbio das posições acompanha o dólar quando ele vem
  do histórico;
- em seguida, se a última tentativa de cotações tiver mais de uma hora, a
  atualização da spec 020 grava as cotações do dia e reprecifica só a
  competência do mês corrente;
- a tela passa para a competência nova quando nenhuma estiver fixada na URL e
  não houver edição pendente;
- um aviso informa as competências criadas e de qual mês foram copiadas. Se
  uma competência passada ficou com cotações repetidas, o aviso vira alerta,
  permanece até ser fechado e lista o mês e os símbolos repetidos;
- uma falha na virada gera um aviso de erro e não impede a atualização das
  cotações nem quebra a página.

## Decisões tomadas

- confirmado pelo usuário em 2026-10-02: "considerando a data do último dia do
  mês" significa que a cotação de cada competência gerada é a do último dia
  daquele mês;
- a regra da spec 003 de não preencher meses intermediários sem confirmação
  foi substituída pela decisão do usuário de gerar todas as competências
  faltantes. Lacunas antes da competência mais recente não são preenchidas;
- os provedores não oferecem aqui uma consulta histórica utilizável, e este
  ambiente não alcança a rede deles, então a cotação do último dia vem só do
  histórico diário gravado pela spec 020. Na prática, um mês em que o
  aplicativo não foi aberto não tem histórico e repete a cotação do anterior;
  isso é informado no aviso e fica marcado no banco;
- marca no banco: `market_quotes.carried_from` guarda a competência cuja
  cotação foi repetida. Numa sequência de meses repetidos, aponta para a
  competência que tem o valor próprio, não para o mês imediatamente
  anterior. É nulo quando o valor é do próprio mês: importado do Excel, vindo
  do histórico diário, atualizado pela [spec 020](020-daily-quotes.md) ou por
  "Atualizar carteira", ou editado à mão. `quote_date` continua sendo só o
  dia do preço, conservado na cotação repetida, e não serve de marca, porque é
  nulo em todas as cotações importadas. Desfazer uma edição de cotações
  restaura as duas colunas. A [spec 022](022-quotes-page.md) mostra essa
  marca como "Repetida de …" na página de cotações. Não foi criada uma tabela de execuções
  da virada;
- o clone manual da [spec 017](017-positions-editing.md) também marca as
  cotações copiadas como repetidas, para que a marca não dependa de qual
  caminho criou o mês;
- os meses que eram correntes não são reprocessados na virada: como cada
  atualização copiava o valor do dia para a cotação do mês corrente, ela já
  guarda a última atualização feita naquele mês. Uma cotação desse mês editada
  à mão depois disso é respeitada;
- todas as competências faltantes são criadas em uma única transação, com
  bloqueio consultivo do PostgreSQL e releitura da mais recente dentro dele,
  para que duas abas abertas ao mesmo tempo não criem o mesmo mês;
- o dia de referência vem do relógio local do servidor, como na spec 020, e
  `ensureMonthsUpToDate(today)` recebe a data explicitamente para teste;
- o clone manual da spec 017 e o fluxo "Atualizar carteira" continuam
  funcionando. Depois da virada o botão de clonar deixa de aparecer, porque a
  competência mais recente já é a do mês corrente; "Atualizar carteira" passa
  a encontrar o rascunho criado pela virada e registra a execução nele, como
  já fazia com rascunhos clonados. "Atualizar carteira" foi removido depois,
  pela [spec 022](022-quotes-page.md);
- a criação reaproveita a lógica de cópia do clone em um módulo próprio,
  `month-rollover.ts`; `month-editing.ts` só mudou para manter a marca de
  repetida no clone, na edição de cotações e no desfazer;
- nos testes de interface a checagem de abertura é simulada, como na spec 020,
  porque a virada real criaria competências no banco do usuário e mudaria a
  competência mais recente no meio dos cenários.

## Questões em aberto

Escolhas feitas pelo agente durante a implementação, em vigor no código, que
aguardam confirmação do usuário:

- sem cotação diária dentro de um mês gerado, a competência repete a cotação
  do mês anterior, marcada e avisada. A alternativa seria buscar nos
  provedores a cotação histórica do último dia, fora do alcance deste
  ambiente. O usuário aceita a repetição?
- as competências geradas ficam como rascunho, como no clone;
- a tela passa sozinha para a competência nova quando nenhuma está fixada na
  URL e não há edição pendente;
- o aviso de cotação repetida só aparece para competências passadas: a do
  mês corrente recebe as cotações do dia na atualização que roda logo depois,
  ou na próxima, se a última tentativa tiver menos de uma hora.

## Fora do escopo

- buscar nos provedores a cotação histórica do último dia;
- preencher lacunas anteriores à competência mais recente;
- desfazer uma competência criada pela virada; a exclusão de competências não
  existe na interface;
- página de cotações para revisar as repetidas: [spec 022](022-quotes-page.md).

## Critérios de aceite

- abrir o aplicativo sem a competência do mês corrente cria essa competência
  a partir da anterior, com posições, rateios e cotações;
- com mais de um mês sem abrir, todas as competências faltantes são criadas,
  cada uma a partir da anterior;
- cada competência gerada usa a cotação do último dia do mês disponível no
  histórico diário e, na falta dele, repete a do mês anterior e avisa;
- aberturas simultâneas criam cada competência uma única vez;
- toda cotação repetida fica marcada em `carried_from`, e a marca sai quando
  a cotação recebe valor próprio;
- competências existentes não são alteradas pela virada;
- lint, tipos, build e testes de interface passam.

## Verificação

Em um banco próprio criado pelas migrações e carregado com a importação e as
normalizações do Excel, com setembro de 2026 como competência mais recente, um
roteiro descartável passou nos cinco casos:

- hoje igual a 2026-10-02: outubro criado como rascunho, com as 21 posições,
  preços, totais, estratégias e rateios iguais aos de setembro, as 12
  cotações repetidas e os 10 símbolos das posições informados como repetidos;
  setembro idêntico;
- segunda chamada: nada criado;
- três chamadas simultâneas: uma cria outubro, as outras duas encontram a
  competência pronta, e existe um único outubro;
- hoje igual a 2026-12-15, com histórico de BTC em 20/11, 30/11 e 01/12, de
  VOO em 10/12 e 20/12 e de USD em 28/11: novembro e dezembro criados;
  novembro com BTC de 30/11 e posições de bitcoin reprecificadas, câmbio de
  28/11 em todas as posições e VOO repetido de outubro com o total copiado;
  dezembro com BTC de 01/12, VOO de 10/12, sem usar o dia 20/12 posterior a
  hoje, GLDM repetido desde outubro e USD repetido de novembro;
- checagem de abertura com hoje igual a 2026-12-15 e buscador injetado: cria
  novembro e dezembro e só depois atualiza as cotações, reprecificando apenas
  dezembro, com novembro mantendo o valor de 30/11.

Com outubro criado pela virada, `refreshPortfolioMonth`, o fluxo "Atualizar
carteira", com buscador injetado, reaproveitou esse rascunho, registrou a
execução nele e concluiu as 10 cotações.

Correções da revisão, em 2026-10-02, com o banco recriado pela migração
corrigida e um roteiro descartável:

- as cotações importadas de setembro ficam com `carried_from` e
  `quote_date` nulos;
- o clone manual de outubro marcou as 12 cotações com `carried_from` igual a
  setembro, e desfazer o clone removeu a competência;
- a virada para outubro marcou as 12 cotações como repetidas de setembro;
- editar à mão BTC e VOO em outubro anulou `carried_from` e `quote_date`, e
  desfazer a edição restaurou os dois;
- hoje igual a 2026-12-15, com BTC no histórico em 30/11: novembro com BTC de
  30/11 sem marca, VOO repetido de outubro e ARGT e BRL repetidos desde
  setembro; dezembro com BTC repetido de novembro e VOO ainda repetido de
  outubro;
- "Atualizar carteira" sobre o rascunho de dezembro limpou a marca e gravou
  o dia da consulta.

Pela interface, sem simulação e sem rede para os provedores, abrir Posições
mostrou setembro, criou outubro, passou para "Outubro de 2026" e exibiu os
avisos de competência criada e das 10 cotações com falha, no computador e no
Pixel 7. Repetido depois das correções, outubro ficou com as 12 cotações
marcadas como repetidas de setembro.

O novo arquivo `tests/e2e/month-rollover.spec.ts` cobre, com a checagem
simulada e sem gravar: o aviso da competência do mês, o alerta de meses
passados com cotações repetidas e a falha da virada sem quebrar a página.
`pnpm lint`, `pnpm typecheck` e `pnpm build` passaram, e a suíte completa do
Playwright passou com 34 cenários nos perfis de computador e Pixel 7, e de
novo com cada cenário repetido duas vezes, 68 de 68. Depois das correções da
revisão, a suíte passou com 40 cenários.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Cotações diárias e atualização ao abrir](020-daily-quotes.md)
- [Atualização mensal manual](003-manual-monthly-update.md)
- [Posições: edição](017-positions-editing.md)
- [Decisões de arquitetura](../../docs/architecture.md), "Evolução do
  histórico"
