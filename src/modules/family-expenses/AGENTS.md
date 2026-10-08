# Gastos familiares

Área pessoal de acerto de contas entre o dono e pessoas da família, sob
Finanças. Regras e decisões nas specs
[082](../../../.ai/specs/082-family-expenses-ledger.md),
[083](../../../.ai/specs/083-family-expense-series.md) e
[084](../../../.ai/specs/084-family-expenses-backup-and-load.md); o acesso, na
[081](../../../.ai/specs/081-module-access-and-area-navigation.md).

- A lista mensal, as cores e a ordem dos filtros dependentes seguem a
  [spec 085](../../../.ai/specs/085-family-ledger-and-navigation-polish.md);
  a [spec 086](../../../.ai/specs/086-family-person-and-month-selection.md)
  define pessoa única alfabética, badges e meses únicos/múltiplos. A
  [spec 087](../../../.ai/specs/087-family-ledger-layout-and-reopen.md) define
  a ordem dos blocos, os indicadores de pendências e a reversão de acertos.
  A [spec 091](../../../.ai/specs/091-family-person-first-and-year-strip.md)
  mostra os doze meses do ano na faixa (com rolagem própria) e compacta os
  controles, mantendo competência → pessoa. Cores de toda a área, inclusive
  formulários, seguem o [guia de estilos](../../../docs/style-guide.md).
- Toda leitura e gravação passa por `getFamilyDb`/`getFamilyContext`
  (`application/family-db.ts`), que confere a concessão `FAMILY_EXPENSES` antes
  de devolver o cliente com escopo do usuário. Não use `getPrismaClient` nem
  `getUserDb` direto nas tabelas `family_*`.
- Dinheiro em centavos inteiros fora do banco (`src/lib/money.ts`, comum às
  áreas desde a spec 088); o banco guarda DECIMAL(12,2) com
  `CHECK amount > 0`. O saldo é derivado do tipo e nunca guardado.
- Os nomes da planilha ficam na interface: DEVE/DEVO (`RECEIVABLE`/`PAYABLE`)
  e OK/NOK (`SETTLED`/`PENDING`).
- O backup da área é um arquivo próprio, separado do da carteira; mudanças nas
  tabelas seguem [docs/backup-format.md](../../../docs/backup-format.md).
- Testes que gravam rodam no schema `gastos_familiares_teste`
  (`tests/integration/family-expenses.test.ts`) ou num servidor de teste com
  `E2E_FAMILY_WRITES=1` (`tests/e2e/family-expenses.spec.ts`).
