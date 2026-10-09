# 097 — Marca de pendência do mês igual para todas as pessoas

Estado: implementada e conferida localmente em 2026-10-08, sem commit nem
publicação.
Origem: pedido do usuário em 2026-10-08 sobre o seletor de competência de Gastos
familiares ([spec 096](096-shared-month-strip-and-variants.md)).

## Problema

A marca de atenção dos meses (o ponto ao lado do mês e o nome acessível
"…, com pendências") considerava só a pessoa escolhida
([spec 087](087-family-ledger-layout-and-reopen.md), critério 5). Ao trocar de
pessoa, a marca aparecia e sumia.

## Decisão do usuário

O indicador do mês é global: mostra o mês enquanto **qualquer pessoa** tiver um
lançamento pendente nele e só some quando ninguém tiver mais. A marca das
pessoas (o ✓ de "sem pendências") continua considerando as competências
escolhidas.

## Implementação

- `pendingFilterActivity` (`src/modules/family-expenses/domain/filters.ts`)
  junta os meses de todos os lançamentos pendentes, sem filtrar pela pessoa;
  deixou de receber as pessoas. Busca, status e tipo continuam sem esconder
  pendências (spec 087).
- O `YearMonthPicker` (régua e folha do celular) não mudou: recebe o conjunto
  de meses pronto. O comentário da prop foi atualizado.

## Verificação

- `tests/unit/family-expense-filters.test.ts`: o teste da spec 087 passou a
  esperar os meses de todas as pessoas, e um teste novo confere que o conjunto é
  o mesmo para qualquer pessoa e que ele fica vazio quando tudo foi acertado
  (16 testes).
- No servidor `recebimentos-teste`, trocando de Marcela para Papai em outubro
  de 2026, setembro e outubro continuam marcados.
- `tests/e2e/family-expenses.spec.ts` (Chrome, Android e iPhone) passou.
