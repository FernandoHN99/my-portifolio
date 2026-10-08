# Formato do backup em JSON

Fonte principal do formato do arquivo de backup e de como mantê-lo. Desde a
[spec 047](../.ai/specs/047-remove-excel-import.md), a única forma oficial de
levar dados para dentro ou para fora do aplicativo é este arquivo: exportar e
restaurar pela Configuração ou por `pnpm backup:export --user` e
`pnpm backup:restore --user` ([spec 042](../.ai/specs/042-data-backup.md)). Não
existe mais importação do Excel.

Desde a versão 4 ([spec 052](../.ai/specs/052-per-user-backup.md)), o arquivo é
a carteira de um usuário: os dados dele, sem o usuário, e as cotações
compartilhadas dos símbolos dele ([spec 051](../.ai/specs/051-shared-automatic-quotes.md)).

## Onde está o código

| Arquivo | Papel |
|---|---|
| `src/modules/backup/domain/backup-format.ts` | formato, versão atual (`BACKUP_VERSION`) e ordem das tabelas (`BACKUP_TABLES`) |
| `src/modules/backup/application/backup.ts` | leitura e gravação: `TABLE_SPECS` liga cada tabela ao modelo do Prisma; `UPGRADES` converte arquivos antigos |
| `src/app/api/backup/` | download (`GET`) e restauração em dois passos (`POST`, `check` e `apply`) |
| `src/modules/backup/ui/backup-panel.tsx` | painel da Configuração |
| `scripts/backup.ts` | os mesmos passos pelo terminal |

## Estrutura do arquivo

```json
{
  "format": "meu-portfolio-backup",
  "version": 5,
  "exportedAt": "2026-10-03T18:17:27.609Z",
  "tables": {
    "dataImports": [],
    "institutions": [{ "id": "…", "name": "Inter", "normalizedName": "inter", "createdAt": "…" }],
    "…": []
  }
}
```

- `tables` tem uma lista por tabela, com os campos escalares do modelo do
  Prisma, pelos nomes do Prisma (não os da coluna), menos os de `omit` em
  `TABLE_SPECS`: o `userId` das tabelas da carteira e o `runId` das cotações
  diárias;
- as tabelas da carteira trazem só os dados do usuário que exportou; das
  compartilhadas (`shared` em `BACKUP_TABLES`), `marketQuotes` e `dailyQuotes`,
  só as dos símbolos dos ativos dele, das cotações que ele digitou e do dólar;
- os ids vão como estão, e a restauração os grava de volta, mantendo os
  relacionamentos e os endereços das posições. Um id que outro usuário já usa
  ganha um id novo, e as chaves estrangeiras de `references` acompanham;
- datas vão em ISO 8601 e decimais como texto, que o Prisma aceita de volta;
  BigInt vai como texto e volta pela lista `bigints` da tabela em
  `TABLE_SPECS`;
- a ordem de `BACKUP_TABLES` é a de gravação: cada tabela depois das que ela
  referencia. A limpeza segue a ordem inversa.

Tabelas da versão 5, na ordem: `dataImports`, `institutions`, `accounts`,
`assets`, `portfolioMonths`, `positions`, `positionAllocations`,
`positionTransactions`, `targetPlans`, `allocationTargets`, `manualQuotes` e as compartilhadas
`marketQuotes` e `dailyQuotes`. As execuções da atualização de cotações são de
todos os usuários e não entram no arquivo. O cadastro dos símbolos cotados
(`quote_symbols`, [spec 053](../.ai/specs/053-scheduled-quote-sync.md)) também
fica de fora: ele é derivado dos ativos, e o job agendado cadastra sozinho, na
execução seguinte, os símbolos de um backup restaurado.

Os indexadores compartilhados (`rate_observations`, `rate_coverage`) e a meta
Selic informativa (`reference_rates`, [spec 064](../.ai/specs/064-selic-and-dev-quotes.md),
e o histórico dela, `reference_rate_points`, [spec 067](../.ai/specs/067-selic-per-month.md))
também ficam fora: são dados públicos recarregáveis pelo job, sem vínculos com
uma carteira. Essas tabelas não mudam o conteúdo nem a versão 5 do backup;
exportação, conversão e restauração da carteira permanecem iguais.

Desde a [spec 068](../.ai/specs/068-fixed-classification-and-asset-type.md), os
ativos têm `assetType`, opcional: um arquivo sem o campo restaura com o tipo
vazio, deduzido na leitura, sem mudar a versão. Um arquivo com o campo só
restaura num app que já o conhece.

Desde a [spec 079](../.ai/specs/079-auto-income-prefixed-and-movement-filters.md),
os ativos têm `autoIncome` (rendimento automático, padrão falso), e as
classificações (`positionAllocations`), `ratePercent`: a rentabilidade de cada
uma, % do CDI no Pós-fixado e taxa ao ano no Prefixado, opcional. Um arquivo
sem eles restaura com o cálculo desligado e sem taxas, sem mudar a versão. As
posições continuam com os campos do cálculo da spec 060, usados de novo só com
a flag ligada. O `cdiPercent` dos ativos, da spec 060, continua no arquivo, sem
uso.

## Gastos familiares: arquivo próprio

Desde a [spec 084](../.ai/specs/084-family-expenses-backup-and-load.md), os
dados de Gastos familiares (`family_contacts`, `family_series` e
`family_entries`) não entram neste arquivo: têm o próprio, no formato
`meu-portfolio-gastos-familiares`, versão 1, com as tabelas `familyContacts`,
`familySeries` e `familyEntries`, sem `userId`. O código fica em
`src/modules/family-expenses/domain/family-backup-format.ts` e
`application/family-backup.ts`; as portas são o botão Backup da página,
`/api/gastos-familiares/backup` e `pnpm family:backup`.

- restaurar a carteira (este arquivo, versão 5) apaga e regrava só as tabelas
  de `BACKUP_TABLES`: backups antigos, sem a área, não tocam nos gastos;
- restaurar os gastos substitui só os gastos do usuário, com a mesma
  conferência estrita (campo ou tabela desconhecidos, valores fora das regras
  e referências quebradas recusam o arquivo) e ids trocados quando outro
  usuário já os usa;
- concessões de área e papéis (`module_grants`, `role_grants`) não entram em
  nenhum dos dois arquivos: só o servidor concede (`pnpm auth:access`);
- uma mudança nas tabelas da área segue o roteiro abaixo, com
  `FAMILY_BACKUP_VERSION` no lugar de `BACKUP_VERSION`.

## Recebimentos: arquivo próprio

Desde a [spec 092](../.ai/specs/092-income-backup-and-load.md), os meses e os
holerites de Recebimentos (`income_months` e `income_payslips`) também têm o
próprio arquivo, no formato `meu-portfolio-recebimentos`, com as tabelas
`incomeMonths` e `incomePayslips` (versão 1) e, desde a
[spec 094](../.ai/specs/094-income-hours-model.md), `incomeHourRecords`
(versão 2), sem `userId`. A versão 3 ([spec 095](../.ai/specs/095-payslip-taxable-flag.md))
acrescenta `taxable` aos holerites. O código fica em
`src/modules/income/domain/income-backup-format.ts` e
`application/income-backup.ts`; as portas são o botão Backup de Recebimentos,
`/api/recebimentos/backup` e `pnpm income:backup`.

- restaurar a carteira ou Gastos familiares não toca nos recebimentos, e
  restaurar os recebimentos não toca nas outras áreas;
- a conferência é estrita como a de Gastos familiares e recusa também mês
  repetido e holerite com período fora do mês;
- a Previdência só lê a carteira e os holerites: não tem arquivo próprio;
- uma mudança nas tabelas da área segue o roteiro abaixo, com
  `INCOME_BACKUP_VERSION` no lugar de `BACKUP_VERSION`.

Versões do arquivo de Recebimentos (a restauração aceita as listadas em
`INCOME_BACKUP_ACCEPTED_VERSIONS`; tabela ausente vale como vazia):

| Versão | Desde | Mudança |
|---|---|---|
| 1 | 2026-10-07, spec 092 | `incomeMonths` e `incomePayslips` |
| 2 | 2026-10-08, spec 094 | entra `incomeHourRecords` (horas declaradas, pagas e trabalhadas por tipo e mês); o arquivo da versão 1 entra sem conversão, com as horas vazias |
| 3 | 2026-10-08, spec 095 | `incomePayslips` ganha `taxable` (obrigatório: a linha entra na renda tributável do limite do PGBL); os arquivos das versões 1 e 2 entram com `taxable` pelo tipo (13º e PLR fora, o resto dentro), a regra de antes |

## Restauração

Desde a [spec 054](../.ai/specs/054-derived-currency-and-single-target-plan.md),
as metas são uma só por usuário: a restauração grava só o plano vigente
(`isActive`) de `targetPlans`, com as metas dele, e deixa de fora as versões
anteriores que arquivos mais antigos trazem.

1. `check` confere o arquivo sem gravar e devolve o resumo (contagem por
   tabela, hoje e no arquivo, e o intervalo de competências);
2. `apply`, depois da confirmação, apaga os dados do usuário e grava os do
   arquivo numa única transação, com os bloqueios da virada de mês, da
   atualização de cotações e das metas padrão. As cotações compartilhadas não
   são apagadas: o arquivo só acrescenta as que faltam no mês ou no dia, sem o
   id dele. A restauração confere as contagens das tabelas da carteira e
   acrescenta uma linha em `dataImports`. Qualquer falha desfaz tudo;
3. um arquivo sem `targetPlans` ganha, depois da restauração, as metas padrão
   (cada grupo dividido em partes iguais entre as categorias da competência
   mais recente), como um banco novo
   ([spec 048](../.ai/specs/048-default-targets-and-quotes-button.md)). As
   metas são dados como os outros: ajustadas na Configuração, saem no próximo
   backup.

A conferência recusa outro formato, versão mais nova que a do app e tabela ou
campo desconhecido. Tabela ausente vale como vazia. Um arquivo de versão
anterior passa pelos passos de `UPGRADES` até a versão atual antes de ser
conferido.

## Histórico de versões

| Versão | Desde | Mudança |
|---|---|---|
| 1 | 2026-10-03, spec 042 | primeira versão, com as tabelas da importação do Excel |
| 2 | 2026-10-03, spec 047 | saem `importBatches`, `importSourceRows`, `importIssues` e os campos `sourceBatchId`, `sourceRowId`, `sourceSheet` e `sourceCell`; entra `dataImports` |
| 3 | 2026-10-03, spec 049 | saem `monthlyUpdateRuns` e `quoteUpdateResults`, sem uso; meses com status `IMPORTED` passam a `REVIEWED` |
| 4 | 2026-10-03, specs 051 e 052 | o arquivo passa a ser de um usuário: sai `userId`; saem `quoteRefreshRuns`, `quoteRefreshResults` e o `runId` de `dailyQuotes`; entra `manualQuotes`, vazia na conversão, porque até a versão 3 a cotação editada à mão ficava em `marketQuotes` |
| 5 | 2026-10-04, specs 056 a 060 | entra `positionTransactions` (movimentações das posições, com `transferId` nas liquidações), vazia na conversão; as posições ganham `openingQuantity`, a base do mês, igual à quantidade na conversão, e o estado do cálculo pelo CDI (`calculationStartDate`, `calculatedIncomeBrl`, `incomeCalculatedThrough`, `incomeCalculationError`), desligado na conversão; os ativos ganham `cashAccount`, `cdiPercent` e `appliedOn`, com padrão no banco. As taxas do CDI (`rate_observations`) são de todos e ficam fora do arquivo |

## Como mudar o formato

Toda mudança no `prisma/schema.prisma` que acrescente, renomeie ou remova
tabela ou campo precisa passar pelo backup. Exemplo: as transações dentro das
posições, previstas no [backlog](../.ai/context/backlog.md).

1. **Schema e migração**: altere o schema e crie a migração (`pnpm db:migrate`,
   ou `prisma migrate dev --create-only` num schema de teste).
2. **Tabelas**: tabela nova da carteira entra em `BACKUP_TABLES`, na posição certa da
   ordem de gravação e com `shared` quando é de todos os usuários, e em
   `TABLE_SPECS`, com o modelo, a tabela do banco, o
   `Prisma.<Modelo>ScalarFieldEnum`, os campos fora do arquivo em `omit` (o
   `userId` das tabelas da carteira), as chaves estrangeiras para outras
   tabelas do arquivo em `references`, os campos BigInt em `bigints` e os Json
   opcionais em `nullableJson`. Uma tabela de apoio fica com `label: null`; uma
   que interessa ao usuário ganha um rótulo no resumo da restauração. Dados
   públicos recarregáveis sem vínculo com a carteira podem ficar de fora,
   como o cadastro de símbolos e as taxas; registre aqui a exclusão e sua razão.
3. **Versão**: só campos opcionais ou com valor padrão novos são aceitos por
   arquivos antigos sem conversão, porque a ausência vira o padrão do banco.
   Campo obrigatório novo, campo ou tabela removidos ou renomeados e mudança
   de significado pedem `BACKUP_VERSION` + 1 e um passo em `UPGRADES[versão
   anterior]`, que transforma as tabelas da versão anterior nas da nova (veja
   o passo 1 → 2).
4. **Documento**: acrescente a linha no histórico de versões acima e atualize
   a lista de tabelas.
5. **Teste**: num schema de teste (`pnpm db:test-schema create teste`), crie
   um usuário (`pnpm auth:user create`), restaure um backup da versão anterior
   com `--user`, exporte de novo e compare as tabelas; confira o
   `tests/e2e/backup.spec.ts` e a ida e volta exata de um backup da versão
   nova.
