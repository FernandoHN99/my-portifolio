# 030 — Visão Geral: meses do calendário, início do período e metas sem posição

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Respostas do usuário em 2026-10-02 às questões em aberto das specs 023 e 024,
registradas em [Reestruturação da UX](../context/ux-restructure.md):

- "Variação no mês" e "Variação em 12 meses" comparavam com a competência
  anterior da lista, que às vezes ficava 13 a 18 meses antes por causa das
  lacunas do histórico. O usuário aceitou comparar por meses do calendário,
  com "Histórico insuficiente" quando o mês de comparação não existir; as
  lacunas serão preenchidas no [passo pré-produção](../context/pre-deploy.md);
- "Todo o período" começava em junho de 2023, com só 5 posições, e mostrava
  +502%. Pedido: começar na primeira competência minimamente completa;
- uma meta sem posição, como IPCA Curto em março de 2024, deve aparecer como
  "Comprar";
- no celular, "Comprar e vender" alargava a página para 682 px numa tela de
  412 px;
- a linha do tempo deve ficar centralizada na tela larga, e não à esquerda.

## Comportamento

- **Variação no mês**: compara com o mês anterior do calendário. Sem ele, o
  card mostra "—" e "Histórico insuficiente: sem Jul/24"; na primeira
  competência, "Primeira competência do histórico";
- **Variação em 12 meses**: compara com o mesmo mês do ano anterior, com
  "desde Set/25" no detalhe. Sem ele, "Histórico insuficiente: sem Ago/23";
- **Variação em todo o período**: começa em outubro de 2023
  (`PERIOD_START`, em `get-overview-data.ts`). Antes dele, o card diz "O
  período começa em Out/23"; no próprio mês, "Início do período". O gráfico
  de evolução continua mostrando todo o histórico;
- **Metas sem posição**: entram nas tabelas de comprar e vender com valor
  atual zero; viram "Comprar" quando o ideal passa da tolerância. Vale para
  todos os recortes, para a prévia da configuração e para a legenda dos
  donuts, que passa a mostrar "0,0% / 10,0%";
- **Celular**: os itens dos grids de duas colunas da Visão Geral e da página
  da posição recebem `min-w-0`. A tabela de comprar e vender rola dentro do
  painel, e a página fica com a largura da tela;
- **Linha do tempo**: na tela larga, um grid de três colunas centraliza as
  setas e a faixa dos anos; a coluna do meio encolhe e rola quando falta
  espaço, e "Mais recente" fica na coluna da direita. No celular nada muda.

## Decisões tomadas

- outubro de 2023 como início: junho e julho de 2023 têm 5 e 6 posições, a
  linha inconsistente de Bitcoin pendente e dois meses sem competência logo
  depois; outubro é o primeiro mês com as 10 posições da carteira de então e
  abre uma sequência quase contínua. Depois do passo pré-produção, o início
  pode voltar para a primeira competência;
- a "Variação em 12 meses" de junho de 2024 passou a comparar com junho de
  2023, que existe exatamente doze meses antes.

## Verificação

- `tests/e2e/overview-adjustments.spec.ts`: início do período em Out/23,
  comparações de Set/26, Ago/24, Jun/24 e Jun/23, IPCA Curto em Mar/24 como
  "Comprar" e a página na largura da tela;
- navegador: Ago/24 mostra "Histórico insuficiente: sem Jul/24" e "sem
  Ago/23"; Mar/24 em renda fixa lista 5 itens para comprar, entre eles IPCA ·
  Curto com R$ 3.083,76; a Visão Geral em 412 px ficou com 412 px de largura;
  a linha do tempo em 1.440 px ficou centralizada;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Linha do tempo compacta](023-compact-month-timeline.md)
- [Visão Geral: duração, variação no período e hover](024-overview-adjustments.md)
