# 059 — Conta corrente e liquidação de títulos vencidos

Estado: concluída em 2026-10-04. Em 2026-10-05, a liquidação com conta corrente
foi substituída pela retirada total da [spec 076](076-position-liquidation.md),
e a opção Conta corrente saiu do formulário
([spec 075](075-position-page-cleanup-and-month-strip.md)).
Definida em: 2026-10-04

## Problema

Pedido do usuário em 2026-10-04, com as regras da seção 5 do
[Prompt de continuidade](../context/position-transactions-prompt.md): aportes e
retiradas comuns não movimentam caixa automaticamente, mas a liquidação de um
título vencido continua nesta etapa, com a escolha de um caixa marcado como
conta corrente. "Saldo em dólar" passa a "Caixa em dólar".

## Comportamento

- **"Caixa em dólar"** no lugar de "Saldo em dólar" no tipo de ativo;
- **conta corrente** (`assets.cash_account`): marca explícita, no formulário da
  posição, aba Ativo. Na inclusão, aparece para Caixa em reais e Caixa em dólar;
  na edição, para ativos sem cotação de mercado (saldos em reais e caixa em
  dólar), porque o ativo não guarda o tipo. Nada é inferido pelo nome, pela
  instituição ou pelo símbolo;
- **liquidar**: um título com vencimento até o dia de referência do mês aberto e
  com saldo mostra o botão de liquidar, sempre à vista na linha de Posições e como
  "Liquidar" na página da posição. O formulário pede a conta corrente de destino
  (só as da mesma moeda do título, sem conversão cambial), o dia (o do
  vencimento, quando cai no mês) e o valor recebido (o saldo, sugerido);
- sem caixa elegível, o formulário explica como marcar ou incluir um;
- **operação atômica**, com desfazer, feita de movimentações ligadas por
  `transfer_id` (transferência interna, que não é aporte externo nem rendimento
  novo da carteira):
  - valor recebido diferente do saldo: a diferença entra antes como rendimento do
    título, negativa quando chega menos (como imposto retido);
  - retirada do título até zero e aporte do valor recebido na conta corrente;
- **sem crédito duplicado**: uma nova submissão encontra o título zerado e é
  recusada;
- **correção consistente**: as pernas não se corrigem por partes; apagar
  qualquer uma apaga a liquidação inteira e recalcula título e caixa;
- liquidar num mês antigo aberto muda o título e o caixa só nesse mês; um mês
  novo criado depois herda os saldos sem repetir a transferência, e o título
  zerado não passa a ele;
- liquidação antecipada não faz parte desta entrega.

## Critérios de aceite

- exemplo do briefing: título de R$ 10.200 e caixa de R$ 800; liquidar por
  R$ 10.200 deixa o título zerado e o caixa com R$ 11.000; um mês novo herda os
  saldos sem segundo crédito;
- caixa de outra moeda é recusado; nova submissão é recusada; apagar uma perna
  apaga todas.

## Verificação

Em 2026-10-04, num schema de teste com o backup de 2026-10-03 restaurado,
chamando as funções do app (vencimento e marca gravados direto, porque os ativos
importados não têm vencimento):

- liquidar a LCI BRB - Set/26 (R$ 10.093) na Flexible Account (dólar) foi
  recusado pela moeda;
- liquidada no Porquinho com R$ 93 a menos: rendimento de −R$ 93, retirada de
  R$ 10.000 e aporte de R$ 10.000, as três com o mesmo `transfer_id`; título
  zerado e Porquinho de R$ 2.427,12 para R$ 12.427,12;
- a segunda submissão foi recusada ("já está zerado");
- apagar o aporte do caixa apagou as três pernas e voltou título e caixa;
- numa rodada anterior, com R$ 50 a mais, a diferença entrou como rendimento
  positivo, e a virada para o mês seguinte não copiou o título zerado e copiou
  a conta corrente.

## Referências

- [Transações: base do mês](056-position-transactions.md)
- [Vencimento dos ativos](026-new-position-entities.md)
