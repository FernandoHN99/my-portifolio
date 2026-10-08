# 095 — Holerite tributável: marcação por linha e bruto tributável no card

Estado: implementada e conferida localmente em 2026-10-08, sem commit nem
publicação. A migração ainda não foi aplicada no banco local do usuário
(`pnpm db:migrate`).
Origem: pedido do usuário em 2026-10-08, depois de estranhar "30 dias · R$
5.542,85 fora do cálculo" na linha do 13º de junho: "temos salário bruto
tributável e salário bruto; deixe um checkbox na tela de cadastro para ficar
claro se eu quiser mudar e, no card Salário bruto, uma indicação do bruto
tributável".

## Decisões

- **A regra deixa de ser fixa no tipo.** Cada linha do holerite tem `taxable`
  (`income_payslips.taxable`, booleano, padrão verdadeiro): se ela entra na
  renda tributável que define o limite de 12% do PGBL da Previdência
  ([spec 089](089-pension-pgbl-limit.md)). O tipo só sugere o padrão
  (`defaultTaxable`): 13º e PLR começam desmarcados; Salário, Férias e Outro,
  marcados. O usuário troca como quiser, inclusive um 13º tributável ou um
  salário fora.
- **Migração `20261008170000_income_payslip_taxable`:** acrescenta a coluna e
  marca como não tributáveis as linhas 13º e PLR que já existem, então nada muda
  nos números de hoje.
- **Formulário do mês** (Recebimentos): cada holerite ganhou o checkbox
  "Tributável (limite do PGBL)" ao lado de "Proporcional aos dias". Trocar o
  tipo repõe o padrão do tipo; depois o usuário ajusta. A linha de baixo de cada
  holerite mostra o valor riscado e "não tributável" quando desmarcado, e a
  prévia do mês ganhou "Bruto tributável" abaixo de "Salário bruto".
- **Card Salário bruto:** o valor principal continua sendo o bruto total do
  ano; embaixo, uma linha "Tributável" com a parte que entra na renda
  tributável (`data-testid="income-kpi-taxable"`). Com o 13º de junho desmarcado,
  o card do usuário de teste mostra R$ 118.727,16 de bruto e R$ 113.184,31
  tributáveis (diferença: R$ 5.542,85).
- **Previdência:** `counted` e a renda tributável de cada linha passam a seguir a
  marcação, não mais o tipo. O texto "fora do cálculo" (que não dizia de qual
  cálculo) virou "não tributável", na Previdência e no formulário.
- **Dados novos nos totais:** `MonthTotals.taxableGrossCents` e
  `YearSummary.totals.taxableGrossCents`, funções puras com teste. A tabela mês
  a mês e os blocos do celular não mudaram.
- **Excluir o mês e desfazer:** o retrato do desfazer guarda a marcação.

## Backup de Recebimentos, versão 3

`INCOME_BACKUP_VERSION` passou a 3: `incomePayslips` ganha `taxable`,
obrigatório (conferência estrita) e na ida e volta. Os arquivos das versões 1 e
2 não têm o campo e continuam aceitos: a conversão o preenche pelo tipo (13º e
PLR fora, o resto dentro), a regra de antes, então importar um deles dá os
mesmos números de antes. Histórico em
[docs/backup-format.md](../../docs/backup-format.md).

O arquivo de carga da [spec 094](094-income-hours-model.md)
(`backups/recebimentos/recebimentos-holerites-2026-10-08.backup.json`) foi
atualizado para a versão 3, com `taxable` explícito em cada holerite (só o 13º
de junho, R$ 5.542,85, está desmarcado). Para mudar uma linha no arquivo, troque
o `taxable` dela.

## Verificação

- `tests/unit/income.test.ts` e `tests/unit/pension.test.ts` (91 testes no
  total): padrão por tipo, marcação contrária ao tipo (13º tributável, salário
  fora), bruto tributável do mês e do ano, e a base da Previdência seguindo a
  marcação.
- `tests/integration/income.test.ts` (schema `recebimentos_teste`, 12 testes):
  gravar a marcação contrária ao tipo, a Previdência segui-la, trocar ao salvar,
  o desfazer devolvê-la, backup v3 em ida e volta, v3 sem `taxable` recusada e
  conversão das versões 1 e 2 pelo tipo (inclusive o arquivo de carga da spec
  094, que é da versão 2).
- `tests/e2e/income.spec.ts` (servidor `recebimentos-teste`): o card mostra o
  bruto e o tributável do ano iguais aos dos dados; o formulário tem o checkbox
  de cada holerite e a prévia acompanha a troca, sem salvar.
- Conferido no navegador (servidor de teste) em 1440 e 375 px: checkbox, texto
  "não tributável" e card sem corte nem rolagem lateral.
- `prisma migrate deploy` no schema de teste; `tsc --noEmit` e `eslint` sem erros.
