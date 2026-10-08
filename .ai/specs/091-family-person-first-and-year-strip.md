# 091 — Ano inteiro na faixa e controles compactos

Estado: implementada e conferida localmente em 2026-10-07; publicação junto com
as specs 088 a 092.
Origem: comentários 2 a 5 do usuário no navegador, em Gastos familiares,
iniciados por outro agente e concluídos depois da correção do usuário.

## Correção do usuário (2026-10-07)

O pedido de pôr a pessoa acima da competência foi retirado pelo próprio
usuário ("aqui eu errei, deixe como está: meses em cima e pessoas embaixo, de
acordo com o mês selecionado"). Continua valendo a precedência competência →
pessoa → status → tipo da [spec 085](085-family-ledger-and-navigation-polish.md)
e da [spec 086](086-family-person-and-month-selection.md). O nome do arquivo
guarda o pedido original.

> Nota (2026-10-08): a faixa de Competência deste documento foi substituída pelo
> seletor com anos e meses embaixo do título, com seleção múltipla e "Ano todo"
> ([spec 096](096-shared-month-strip-and-variants.md)). Os demais critérios valem.

## Critérios de aceite

1. A faixa de Competência mostra os doze meses do ano selecionado, do mais
   recente ao mais antigo, com rolagem horizontal restrita à faixa quando
   necessário e o mês selecionado mantido à vista; não há mais o limite de
   seis meses da spec 086. Meses sem lançamentos continuam selecionáveis.
2. Pessoa fica abaixo da Competência e lista as pessoas dos meses
   selecionados, nos badges, nos filtros do computador e na folha do celular.
3. A seleção única/múltipla continua; outros anos ficam no filtro
   Competência, que lista os doze meses de cada ano com lançamentos.
4. O bloco Lançamentos fica mais compacto: cabeçalho, mês, linhas e rodapé com
   menos altura; no computador, os botões de acertar e reverter têm 28 px
   (32 px no toque). O ícone da seleção múltipla tem 24 px, com rótulo, foco e
   alvo de toque preservados.
5. Resumos, acerto e indicadores usam os filtros efetivos; a faixa não gera
   nem altera lançamentos.

## Verificação

- `tests/unit/family-expense-filters.test.ts`: precedência por mês mantida e
  `fullYearCompetences` com os doze meses de cada ano.
- `tests/e2e/family-expenses.spec.ts`: doze meses na faixa e meses acima das
  pessoas.
- Navegador (servidor de teste, 494 lançamentos carregados no usuário de
  teste): 375 px sem rolagem da página, faixa com rolagem própria e o mês
  selecionado visível; Set+Out/26 mostram as pessoas dos dois meses.
