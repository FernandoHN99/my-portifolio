# 020 — Cotações diárias e atualização ao abrir

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

## Problema

A planilha e a [spec 003](003-manual-monthly-update.md) misturavam a busca de
cotações com a criação do mês, no mesmo botão. Em 2026-10-02 o usuário separou
os dois processos e decidiu que as cotações guardam histórico diário por
ativo, atualizado automaticamente ao abrir o aplicativo quando a última
atualização tiver mais de uma hora, com um botão manual. As decisões estão em
[Reestruturação da UX](../context/ux-restructure.md), em "Respostas do
usuário em 2026-10-02" e "Ajustes pedidos em 2026-10-02, antes da
previdência".

Até aqui `market_quotes` guardava uma cotação por símbolo e competência, e
cada busca sobrescrevia a cotação do mês.

## Objetivo

Buscar somente os valores das cotações, acumular o histórico do dia e manter
a competência corrente precificada, mostrando no topo quando foi a última
atualização e avisando cada ativo que falhou.

A virada de mês é o outro processo e fica na
[spec 021](021-automatic-month-rollover.md).

## Comportamento

- ao abrir o aplicativo, depois que a página aparece, o navegador pede a
  checagem de abertura; o servidor atualiza as cotações se a última tentativa
  começou há uma hora ou mais e responde sem atualizar caso contrário;
- a checagem também roda quando a aba volta a ficar visível e a última
  checagem daquela aba tem mais de uma hora;
- o topo mostra "Atualizado há 5 min", "Atualizado às 14:05", "Atualizado
  ontem às 14:05" ou "Atualizado em 30/09 às 14:05", atualizado a cada 15
  segundos, com a seta de atualizar ao lado; no celular aparecem só a seta e
  o tempo curto, como "5 min" ou "14:05";
- a seta gira enquanto a atualização roda e o texto vira "Atualizando
  cotações…"; a seta manual atualiza sempre, exceto se já houver uma
  atualização em andamento, caso em que um aviso informa isso;
- o horário exibido é o fim da última execução com pelo menos uma cotação
  atualizada; se a última tentativa teve falhas, um ponto vermelho aparece na
  seta e a dica do botão lista os símbolos com falha;
- cada execução com falha gera um aviso que nomeia cada ativo: o símbolo, os
  ativos da carteira que o usam, o provedor e o motivo; os demais valores
  continuam atualizados;
- a atualização manual bem-sucedida mostra "Cotações atualizadas"; a
  automática bem-sucedida não mostra aviso, só o horário novo;
- quando algo mudou, a tela recarrega os dados sem bloquear a navegação;
- nenhuma falha de provedor, de rede ou do próprio servidor quebra a página.

## Regras da atualização

1. Símbolos consultados: os `quote_symbol` das posições da competência do mês
   corrente. Sem essa competência, os da competência mais recente, e nesse
   caso só o histórico diário é gravado.
2. O tipo de instrumento e a moeda base saem da cotação mensal mais recente
   do símbolo ou, na falta dela, do histórico diário; sem nenhum dos dois, o
   símbolo falha com `MISSING_QUOTE_METADATA`.
3. Os provedores são os mesmos da spec 003, pelo `fetchCurrentQuotes`.
4. Cada sucesso grava a cotação do dia em `daily_quotes`. Uma nova atualização
   no mesmo dia sobrescreve o valor daquele dia; dias anteriores nunca mudam.
5. Na competência do mês corrente, cada sucesso atualiza a cotação do mês em
   `market_quotes`, com `quote_date` igual ao dia, e reprecifica as posições
   daquele símbolo: preço unitário igual à cotação e total igual à quantidade
   vezes a cotação, arredondado em centavos. O dólar também atualiza o câmbio
   gravado nas posições da competência, como a edição de cotações da
   [spec 017](017-positions-editing.md).
6. Quantidades nunca mudam, e competências passadas nunca são tocadas.
7. Resultados, histórico diário, cotações do mês, posições e o fechamento da
   execução são gravados em uma única transação.

## Modelo de dados

Migração aditiva `daily_quotes`:

- `daily_quotes`: símbolo, dia (`quote_date`), tipo de instrumento, moeda
  base, valor em reais, provedor, horário da consulta e a execução que gravou;
  único por símbolo e dia;
- `quote_refresh_runs`: gatilho `AUTO` ou `MANUAL`, estado `RUNNING`,
  `COMPLETED`, `COMPLETED_WITH_ISSUES` ou `FAILED`, dia das cotações,
  competência reprecificada, início, fim e mensagem;
- `quote_refresh_results`: um resultado por símbolo e execução, com provedor,
  estado, valor ou código e mensagem de erro;
- `market_quotes.quote_date`: dia do preço que a cotação do mês carrega,
  quando conhecido.

## Decisões tomadas

- a cotação de uma competência deriva do histórico diário assim: enquanto o
  mês é o corrente, cada atualização grava o dia e copia o valor para a
  cotação do mês; quando o mês acaba, fica a última atualização feita nele, ou
  seja, a do último dia disponível. `market_quotes` continua sendo a cotação
  materializada da competência, lida por todas as telas;
- o histórico diário não foi preenchido a partir das cotações mensais
  importadas: elas são fatos do mês, sem dia conhecido, e criar pontos diários
  inventaria dados. Por isso `quote_date` fica nulo nas cotações importadas,
  clonadas pela spec 017 ou editadas à mão;
- cada símbolo é independente: os sucessos são aplicados e os que falharam
  mantêm o valor anterior. A spec 003 aplicava tudo ou nada; com atualização
  automática, um provedor que falha sempre, como o Alpha Vantage sem chave,
  congelaria todas as cotações. A regra de tudo ou nada continua no fluxo
  "Atualizar carteira" de `/atualizacao`, que não foi alterado e não grava
  histórico diário, até a [spec 022](022-quotes-page.md) unir as páginas;
- a regra de uma hora conta qualquer tentativa, com sucesso ou falha, de
  qualquer gatilho. Assim um provedor fora do ar não é consultado a cada
  abertura; a seta manual ignora essa regra;
- consequência conhecida: uma cotação da competência corrente editada à mão no
  painel de cotações é sobrescrita pela próxima atualização, automática ou
  manual. Cotações de competências passadas editadas à mão são preservadas;
- não há agendador. A interpretação de "ao abrir" inclui voltar a uma aba que
  ficou aberta por mais de uma hora, porque para o usuário isso equivale a
  abrir o aplicativo de novo;
- o dia das cotações é o dia do calendário no relógio local do servidor, o
  mesmo critério de `currentReferenceMonth`; o horário exibido usa o fuso do
  navegador, por isso o texto do topo aparece depois da hidratação;
- concorrência: a reserva de uma execução roda em uma transação curta com
  bloqueio consultivo do PostgreSQL; havendo uma execução `RUNNING`, a nova
  devolve "em andamento". Uma execução `RUNNING` há mais de dez minutos é
  encerrada como interrompida, para não travar as seguintes. A consulta aos
  provedores ocorre fora de transação;
- a checagem de abertura e a atualização manual são rotas
  (`POST /api/quotes/open-check` e `POST /api/quotes/refresh`) e não Server
  Actions: o Next despacha Server Actions uma por vez por cliente e uma
  navegação descarta a que estiver pendente, conforme o guia de Server
  Actions da versão instalada. A consulta aos provedores pode levar vários
  segundos e não deve segurar salvamentos nem trocas de tela. As rotas exigem
  corpo JSON e a mesma origem, recusando pedidos de outros sites;
- a página nunca espera os provedores: o servidor só lê o resumo da última
  execução para o topo, e a checagem roda no navegador após a montagem;
- depois de uma execução com algum sucesso, a tela recarrega os dados; se
  houver edições pendentes na aba Posições, o recarregamento é pulado para não
  descartá-las, e os dados novos aparecem ao salvar ou navegar;
- avisos: uma execução gera um aviso que lista todos os ativos com falha, em
  vez de um aviso por ativo. É a interpretação de "exibir toast indicando o
  ativo": cada ativo aparece nomeado, e uma queda de rede não empilha dez
  avisos. Avisos de erro ficam até serem fechados; os de sucesso somem em
  seis segundos;
- os avisos usam o Toast do Base UI com um gerenciador global no layout raiz,
  para sobreviverem à troca de abas, e o visual do `EditToast`. Ficam no topo,
  à direita no computador e na largura toda no celular, para não cobrirem a
  barra de edição nem o aviso de alterações salvas, que ficam embaixo. A
  prioridade é sempre a educada: a prioridade alta do Base UI esconde o aviso
  visível dos leitores de tela;
- as mensagens dos provedores ficaram legíveis: falha de conexão vira
  `NETWORK_ERROR`, "Não foi possível conectar ao provedor.", e resposta fora
  do formato vira "O provedor respondeu em um formato inesperado.", em vez do
  texto bruto do erro; o HTTP 429 diz que houve excesso de consultas;
- todas as execuções ficam guardadas, sem limpeza automática;
- nos testes de interface, as duas rotas são substituídas por respostas fixas
  (`tests/e2e/support/quote-checks.ts`), porque a checagem real grava no
  banco e consulta provedores. `home.spec.ts` ganhou só essa substituição em
  `beforeEach`; não foi preciso variável de ambiente.

## Fora do escopo

- virada de mês automática: [spec 021](021-automatic-month-rollover.md);
- página de cotações com edição, última atualização e histórico de execuções:
  [spec 022](022-quotes-page.md), que pode usar `listQuoteRefreshRuns`;
- busca de cotações históricas nos provedores;
- padronização de símbolos e fontes, incluindo o ativo "Solana" com ticker
  USD;
- política de retenção do histórico de execuções.

## Critérios de aceite

- abrir o aplicativo com a última tentativa há mais de uma hora atualiza as
  cotações; dentro da hora, não consulta provedores;
- a seta do topo atualiza manualmente e gira enquanto roda;
- duas execuções simultâneas não rodam juntas;
- o histórico diário guarda um valor por símbolo e dia, sobrescrevendo só o
  próprio dia;
- a competência do mês corrente é reprecificada, e as passadas não mudam;
- falha parcial aplica os sucessos e avisa cada ativo com falha, pelo nome;
- falha total não altera nada e mantém o horário da última atualização boa;
- o topo mostra o horário relativo em pt-BR no computador e no celular;
- lint, tipos, build e testes de interface passam.

## Verificação

Em um banco próprio criado pelas migrações e carregado com a importação e as
normalizações do Excel, com outubro de 2026 criado pelo clone da spec 017, um
roteiro descartável com buscador injetado passou nos oito casos:

- sem competência corrente, grava só as 10 cotações diárias e setembro fica
  idêntico;
- sucesso total reprecia as 21 posições de outubro, com total igual a
  quantidade vezes cotação em centavos, câmbio novo em todas as posições,
  `quote_date` igual a 2026-10-02, ARGT sem posição não consultado e setembro
  idêntico;
- `AUTO` dentro da hora devolve "fresh";
- falha de BTC e SOL mantém os totais de Bitcoin 01 e Bitcoin 02, atualiza o
  VOO, sobrescreve o dia no histórico e nomeia "Bitcoin 01, Bitcoin 02";
- buscador que lança erro de rede: execução `FAILED`, nada muda, a mensagem é
  "Não foi possível conectar ao provedor." e o resumo mantém a última
  atualização boa;
- duas chamadas simultâneas: uma roda e a outra recebe "em andamento"; cinco
  simultâneas: uma roda e quatro recebem "em andamento";
- execução presa há vinte minutos é encerrada como interrompida;
- `AUTO` depois de uma hora roda de novo.

Pela rota real, sem rede para os provedores neste ambiente, a checagem de
abertura terminou em menos de um segundo com as 10 cotações em falha (HTTP
403 dos provedores e chave do Alpha Vantage ausente), sem alterar valores.
Pedidos sem JSON receberam 415 e com origem de outro site, 403. Pela
interface, o aviso listou os 10 símbolos com os ativos e o topo manteve
"Atualizado há 10 min" com o ponto vermelho.

O novo arquivo `tests/e2e/quote-refresh.spec.ts` cobre, com as rotas
simuladas e sem gravar: o rótulo do topo no computador e no celular, o aviso
com dois ativos e o fechamento, a atualização manual com a seta girando e o
aviso de sucesso, e o aviso de execução em andamento. As capturas do topo, do
aviso e da seta girando foram conferidas no computador e no Pixel 7.
`pnpm lint`, `pnpm typecheck` e `pnpm build` passaram, e a suíte completa do
Playwright passou com 28 cenários nos dois perfis.

Ao atualizar o ambiente local: aplicar as migrações, rodar `pnpm db:generate`
e reiniciar o `pnpm dev`, conforme o achado registrado na spec 014.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Atualização mensal manual](003-manual-monthly-update.md)
- [Posições: edição](017-positions-editing.md)
- [Virada de mês automática](021-automatic-month-rollover.md)
- [Decisões de arquitetura](../../docs/architecture.md), "Evolução do
  histórico"
- [Análise do VBA](../context/vba-analysis.md), "Cotações"
