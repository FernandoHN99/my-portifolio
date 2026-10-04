# 058 — Histórico e indicadores por movimentações

Estado: concluída localmente em 2026-10-04; sem deploy.

## Problema e regras

Continuidade autorizada pelo usuário em 2026-10-04, a partir do
[briefing consolidado](../context/position-transactions-prompt.md). O histórico
legado contém fotografias mensais, enquanto as posições novas e movimentadas
passam a ter fatos registrados. A interface deve mostrar a origem de cada
indicador e preservar os meses independentes definidos na [056](056-position-transactions.md).

## Implementação

- O histórico carrega abertura e transações por conta/ativo/mês. A visão de
  todas as contas agrega somente as movimentações das contas selecionadas.
- Aportes e retiradas registrados substituem a estimativa onde há transações.
  Meses legados mantêm a estimativa identificada; visões com ambas as origens
  ficam identificadas como mistas.
- Rendimentos, saldo inicial e transferências internas ficam separados.
  Pernas da liquidação não contam como aporte/retirada externos.
- Dividendos registrados sem quantidade aparecem como rendimento recebido,
  sem aumentar a avaliação da posição nem inventar unidades.
- A decomposição reconcilia partida + movimentos + rendimento incorporado +
  transferência interna + saldo inicial + efeito de preço + variação sem
  registro = valor final. Diferenças entre bases mensais independentes não são
  inventadas como aporte ou lucro.
- A cotação da abertura serve para avaliar a posição, sem virar custo de
  compra. Preço médio real requer custo conhecido de todas as unidades;
  abertura sem custo, transferência de unidades ou lacuna tornam esse custo
  desconhecido. Depois de zerar e realizar compras completas, ele pode voltar
  a ser conhecido. O preço médio legado continua identificado como estimado.
- Melhor/pior mês registrado considera efeito de preço e rendimentos, exclui
  aportes e diferenças sem registro. Não se calcula rentabilidade percentual
  de saldos registrados sem base/custo suficientes.
- Correção/exclusão só é oferecida para transações da conta atual no mês
  aberto; a visão de todas as contas identifica a instituição de cada registro.

## Critérios de aceite

1. Manter resultados do histórico legado sem transações.
2. Mostrar aporte pelo valor executado, com diferença para a cotação no efeito
   de preço; dividendos sem quantidade não alteram valor/unidades.
3. Não duplicar fluxo externo em liquidação/transferência interna.
4. Correção de competência antiga não cria retirada/rendimento no mês seguinte
   cuja abertura já estava congelada.
5. Abrir todas as contas mostra as transações dessas contas, sem permitir
   editar uma transação usando outra posição como destino.
6. Desconhecimento do custo de abertura não gera preço médio real inventado.

## Validação até aqui

- `scripts/test-position-history.ts`: dez cenários financeiros de domínio,
  incluindo legado, compras a preço executado, dividendos, saldo manual,
  transferência, ausência, base corrigida sem cascata, custo desconhecido e
  recuperação após zerar. Executado com Node 24; passou.
- Typecheck global e lint dos arquivos de domínio: passaram.
- Tabela "Mês a mês": nos meses com movimentações, os aportes e resgates são os
  registrados (com "registrado", o rendimento e o saldo inicial); nos demais, a
  estimativa continua com "estimado". A lista de movimentações soma aportes,
  retiradas, rendimentos e saldo inicial, mostra a transferência interna à
  parte e avisa quando o custo anterior é desconhecido.
- Em 2026-10-04, a suíte completa do Playwright, nos perfis desktop-chrome,
  mobile-chrome e mobile-safari, passou sobre os dados locais, sem gravar
  carteira; a página da posição abre com "Movimentações" e "Movimentar".

## Código principal

- `src/modules/portfolio/domain/position-history.ts`
- `src/modules/portfolio/domain/position-transactions.ts`
- `src/modules/portfolio/application/get-position-history.ts`
- `src/modules/portfolio/ui/position-detail.tsx`
- `src/modules/portfolio/ui/position-attribution.tsx`
- `src/modules/portfolio/ui/position-months-table.tsx`
- `src/modules/portfolio/ui/position-transactions.tsx`
