# 084 — Backup de Gastos familiares e carga inicial

Estado: concluída localmente em 2026-10-07. Carga feita no banco local, na
conta `nandohneto@gmail.com`, com a autorização do usuário; a produção espera
o deploy, que o usuário aprova à parte.
Origem: pedido do usuário em 2026-10-07; fonte e limites no
[prompt de continuidade](../context/gastos-familia-prompt.md).

## Decisões

- **Arquivo próprio, separado do backup da carteira** (formato
  `meu-portfolio-gastos-familiares`, versão 1, tabelas `familyContacts`,
  `familySeries` e `familyEntries`; [formato](../../docs/backup-format.md)).
  - restaurar a carteira (versão 5, sem mudança) apaga e regrava só as tabelas
    de Investimentos: backups antigos não tocam nos gastos;
  - restaurar os gastos substitui só os gastos do usuário, numa transação com
    bloqueio próprio: a carteira e as concessões não mudam;
  - a conferência é estrita: tabela ou campo desconhecido (como `userId` ou
    `moduleGrants`), valor fora das regras, referência quebrada, pessoa
    repetida ou série mal numerada recusam o arquivo antes de gravar. Uma
    concessão nunca entra por backup.
- **Portas:** Configuração da área ("Backup" na página), `GET
  /api/gastos-familiares/backup` e `POST …/restore` (`check` e `apply`), e
  `pnpm family:backup export|restore --user <e-mail> [--apply]`. Todas pedem
  a concessão.
- **Idempotência da carga:** a restauração substitui os gastos do usuário,
  então repetir o mesmo arquivo dá o mesmo resultado, sem duplicar o lote.
  Os ids da conversão são estáveis (hash do arquivo e número da linha), e as
  linhas iguais da fonte continuam distintas.
- **Conversão controlada** (`pnpm family:convert <arquivo.txt>`,
  `src/modules/family-expenses/domain/source-sheet.ts`): lê as sete colunas
  separadas por tabulação, converte os meses em inglês por tabela fixa e o
  dinheiro brasileiro dígito a dígito, confere o saldo de cada linha contra o
  sinal do tipo e grava, ao lado da fonte (em `backups/gastos-familia/`, fora
  do Git), o backup e o relatório. A fonte não é alterada; linhas fora das
  regras ficam no relatório e fora do backup.

## Decisões do usuário sobre a fonte (2026-10-07)

- **Valores negativos:** trocar o tipo e usar o valor positivo, mantendo o
  saldo da planilha. Valem só para as duas linhas descritas
  (`NEGATIVE_VALUE_DECISIONS` em `scripts/family-expenses.ts`); outra linha
  negativa volta a pedir decisão.
  - linha 168: Jul/24 · Gasolina · Marcela · DEVE −R$ 15,28 → DEVO R$ 15,28;
  - linha 296: Abr/25 · Gasolina Corolla · Sandra · DEVO −R$ 31,50 → DEVE R$ 31,50.
- **Linhas iguais** (328 e 329; 396 e 397): mantidas como lançamentos
  distintos, como recomendado no prompt.
- Nenhuma parcela, recorrência ou correção foi criada a partir das descrições.

## Reconciliação (relatório da conversão)

- 494 lançamentos, 11 pessoas, 37 competências de Out/23 a Out/26; DEVE 338,
  DEVO 156; OK 477, NOK 17; nenhum problema pendente.
- Pendente em Set/26: Marcela R$ 46,00, Martina R$ 73,90, Papai R$ 38,50,
  Sandra R$ 33,00, Vovó R$ 155,00 — total R$ 346,40.
- Pendente em Out/26: Sandra R$ 696,88, Martina R$ 96,00, Marcela R$ 46,00 —
  total R$ 838,88.
- Totais: pendente +R$ 1.185,28, acertado +R$ 30.418,42, total +R$ 31.603,70,
  iguais à soma do Saldo da fonte (as decisões preservaram os saldos).

## Carga local (2026-10-07)

`pnpm family:backup restore --user nandohneto@gmail.com
backups/gastos-familia/gastos-familia-dados-corretos-2026-10-07.backup.json`:
a simulação mostrou 0 → 11 pessoas e 0 → 494 lançamentos; com `--apply`,
gravou 11 e 494, pendente +R$ 1.185,28. Contagens da carteira iguais antes e
depois (25 competências da conta, 837 posições e 739 movimentações no banco).

## Produção (pendente)

Depois do deploy aprovado (a migração concede a área à conta do dono na
produção), a carga é a mesma, pela página ("Backup" → Importar) ou pelo
terminal com a conexão direta do Neon. O arquivo convertido fica em
`backups/gastos-familia/`, fora do Git; noutro ambiente, precisa ser levado à
parte.

## Verificação

- Integração: ida e volta exata do backup; o mesmo arquivo em outro usuário
  ganha ids novos sem mexer no primeiro; `userId` e `moduleGrants` no arquivo
  recusados; restaurar um backup da carteira sem a área mantém os gastos;
  carga do arquivo real duas vezes = 494 lançamentos, pendentes de Set/26 e
  Out/26 e total de +R$ 31.603,70.
- Unitário: a conversão do arquivo real reproduz os pendentes de Set/26 e
  Out/26 e os saldos de todas as linhas.
