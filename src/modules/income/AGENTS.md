# Recebimentos

Área pessoal sob Finanças, com duas abas: o mês a mês (entradas, saídas e
holerites, specs [088](../../../.ai/specs/088-income-ledger.md),
[092](../../../.ai/specs/092-income-backup-and-load.md),
[094](../../../.ai/specs/094-income-hours-model.md) e
[095](../../../.ai/specs/095-payslip-taxable-flag.md)) e as Horas extras
([spec 098](../../../.ai/specs/098-overtime-control.md)). A Previdência
([spec 089](../../../.ai/specs/089-pension-pgbl-limit.md)) lê os holerites daqui.

- Toda leitura e gravação passa por `getIncomeDb`/`getIncomeContext`
  (`application/income-db.ts`), que confere a concessão `INCOME`. As tabelas
  `income_*` e `overtime_*` estão em `OWNED_MODELS` (`src/lib/user-db.ts`).
- Dinheiro em centavos e horas em centésimos inteiros fora do banco (9 h = 900,
  `domain/overtime.ts`); o banco guarda `Decimal`.
- Horas extras: um formulário único por mês (`ui/overtime-entry-dialog.tsx`),
  no padrão da inclusão de posição: etapas ao declarar (Declaração, Anexo da
  folha e Pagamento, os dois últimos opcionais) e abas ao abrir a linha da
  tabela. Declaração em `overtime_months` (digitada ou da folha), pagamentos em
  `overtime_payments` (um por holerite). Não ponha horas extras no formulário do
  mês de Recebimentos, avisos de "conferir", botões na linha nem um quadro de
  holerites: o usuário pediu para tirar todos. A conciliação
  (`reconcileOvertime`) é derivada e nunca guardada; nenhum mês fica "não pago"
  antes do prazo do holerite seguinte.
- `income_hour_records` (spec 094) é só a transcrição dos holerites de 2026, sem
  tela: dá a base do valor da hora normal; não é fonte das horas
  pagas.
- Os totais dos meses importados vêm dos dias; quem muda um dia, a folha ou as
  regras chama `recomputeImportedTotals`.
- A leitura das folhas (`domain/overtime-sheet.ts`) não depende de biblioteca;
  `application/overtime-xlsx.ts` (servidor, `exceljs`) só transforma o arquivo
  em grade. Folhas reais têm anos errados e dias da semana divergentes: a
  leitura corrige pelo dia da semana e avisa, nunca inventa horas.
- Adicionais: os da CLT, regra única desde jan/26 (decisão do usuário); o
  diálogo de Regras guarda versões futuras. A análise das planilhas está em
  [Análise das folhas de horas](../../../.ai/context/overtime-analysis.md).
- Mudança nas tabelas segue [docs/backup-format.md](../../../docs/backup-format.md)
  (`INCOME_BACKUP_VERSION`, hoje 4).
- Testes que gravam rodam no schema `recebimentos_teste`
  (`tests/integration/income.test.ts` e `overtime.test.ts`); o servidor de teste
  é a configuração `recebimentos-teste` do `.claude/launch.json`.
