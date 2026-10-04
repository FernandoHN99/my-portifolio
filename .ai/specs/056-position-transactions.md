# 056 — Transações nas posições: base do mês, saldo inicial e correção sem cascata

Estado: concluída localmente em 2026-10-04 (sem deploy).
Definida em: 2026-10-04

## Problema

Pedido do usuário em 2026-10-04, consolidado em
[Prompt de continuidade](../context/position-transactions-prompt.md), que é a
fonte das regras (seções 1, 3, 4 e 10). Ele quer registrar aportes, retiradas e
rendimentos dentro das posições, sem perder a praticidade atual nem o histórico
mensal.

Esta é a fatia A do briefing: o modelo, os meses e o backup. O formulário e o
lápis ficam na [spec 057](057-movement-form-and-attribute-pencil.md), o
histórico na [spec 058](058-transaction-history-and-indicators.md) e a
liquidação na [spec 059](059-cash-account-and-liquidation.md).

## Decisões

- **base de cada mês** (`positions.opening_quantity`): a quantidade com que a
  posição abriu a competência. A quantidade da posição é a base mais as
  movimentações do mês; cada inclusão, correção ou exclusão recalcula a posição
  do mês a partir disso (`recomputePosition`);
- **competências independentes**: o mês novo (virada ou clone) herda uma vez o
  fechamento do anterior como base, sem copiar as movimentações. Corrigir uma
  movimentação de um mês reaberto muda só aquele mês: a base e o saldo dos meses
  seguintes já criados ficam como estão, sem ajuste fictício para eliminar a
  diferença;
- **histórico legado preservado**: a migração põe a base igual à quantidade em
  todas as posições existentes. Os meses antigos continuam como fotografias, sem
  compras, preços ou rendimentos inventados;
- **saldo inicial** (`OPENING`): o movimento com que nasce uma posição incluída
  pelo app, quando o usuário diz que é um "Saldo que já tinha". Não conta como
  aporte, rendimento nem custo de compra (sem preço executado). A alternativa é
  "Aporte agora", com o preço executado ([spec 057](057-movement-form-and-attribute-pencil.md));
- **movimentações** (`position_transactions`): tipo (`OPENING`, `CONTRIBUTION`,
  `WITHDRAWAL`, `INCOME`), dia financeiro (dentro da competência e nunca no
  futuro), quantidade, preço executado, dinheiro movimentado, observação e o
  vínculo de transferência interna (`transfer_id`, [spec 059](059-cash-account-and-liquidation.md));
- **efeito na quantidade**: a retirada tira, os demais põem; o rendimento em
  dinheiro de um ativo cotado (dividendos) tem quantidade zero e não cria
  unidades; uma retirada maior que a posição é recusada (sem posição vendida);
- só a competência aberta aceita incluir, corrigir ou apagar movimentações; a
  fotografia do desfazer inclui as movimentações do mês;
- posições zeradas, como um título liquidado, não passam ao mês seguinte;
- isolamento por usuário: `PositionTransaction` está no escopo do cliente com
  usuário (`src/lib/user-db.ts`), e a chave composta com a posição impede
  vínculo entre usuários.

## Backup

Versão 5 ([Formato do backup](../../docs/backup-format.md)): entra
`positionTransactions`; as posições ganham `openingQuantity`, igual à
quantidade na conversão de arquivos antigos; os ativos ganham `cashAccount`,
`cdiPercent` e `appliedOn`.

## Critérios de aceite

- saldo inicial de uma posição nova não vira aporte nem custo;
- o exemplo do briefing: outubro começa com R$ 1.000, recebe R$ 200 e termina
  com R$ 1.200; novembro herda R$ 1.200, recebe R$ 50 e termina com R$ 1.250;
  corrigir o aporte de outubro para R$ 300 deixa outubro com R$ 1.300 e
  novembro com base R$ 1.200 e saldo R$ 1.250; dezembro, criado depois, começa
  com R$ 1.250;
- a virada não copia movimentações;
- dois usuários não alcançam as movimentações um do outro;
- backup antigo restaura com a base igual à quantidade; o novo faz ida e volta
  com as movimentações.

## Verificação

Em 2026-10-04, num schema de teste (`tx056`) com os usuários A e B, cada um com
`meu-portfolio-backup-2026-10-03-2016.json` (versão 2) restaurado, chamando as
funções do app como cada usuário:

- as 914 posições restauradas ficaram com a base igual à quantidade;
- incluir "CDB Teste" com R$ 1.000 como saldo inicial gravou `OPENING`, sem
  preço, e base zero;
- o exemplo de outubro, novembro e dezembro acima, passo a passo: outubro
  R$ 1.200, depois R$ 1.300 corrigido no mesmo registro (um aporte só);
  novembro base R$ 1.200 e saldo R$ 1.250; dezembro base R$ 1.250;
- desfazer um rendimento voltou o saldo;
- B não apagou uma movimentação de A, nem pelo mês dele nem pelo de A;
- A exportou (versão 5, 4 movimentações), B restaurou e exportou de novo: as 4
  movimentações e a base de todas as posições voltaram.

## Referências

- [Prompt de continuidade](../context/position-transactions-prompt.md)
- [Descoberta](../context/next-adjustments-discovery.md)
- [Mês aberto ou fechado](034-open-closed-months.md)
- [Virada automática de mês](021-automatic-month-rollover.md)
