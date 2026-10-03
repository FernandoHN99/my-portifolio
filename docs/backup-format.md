# Formato do backup em JSON

Fonte principal do formato do arquivo de backup e de como mantê-lo. Desde a
[spec 047](../.ai/specs/047-remove-excel-import.md), a única forma oficial de
levar dados para dentro ou para fora do aplicativo é este arquivo: exportar e
restaurar pela Configuração ou por `pnpm backup:export` e `pnpm backup:restore`
([spec 042](../.ai/specs/042-data-backup.md)). Não existe mais importação do
Excel.

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
  "version": 3,
  "exportedAt": "2026-10-03T18:17:27.609Z",
  "tables": {
    "dataImports": [],
    "institutions": [{ "id": "…", "name": "Inter", "normalizedName": "inter", "createdAt": "…" }],
    "…": []
  }
}
```

- `tables` tem uma lista por tabela, com os campos escalares do modelo do
  Prisma, pelos nomes do Prisma (não os da coluna);
- os ids vão como estão, e a restauração os grava de volta, mantendo os
  relacionamentos;
- datas vão em ISO 8601 e decimais como texto, que o Prisma aceita de volta;
  BigInt vai como texto e volta pela lista `bigints` da tabela em
  `TABLE_SPECS`;
- a ordem de `BACKUP_TABLES` é a de gravação: cada tabela depois das que ela
  referencia. A limpeza segue a ordem inversa.

Tabelas da versão 3, na ordem: `dataImports`, `institutions`, `accounts`,
`assets`, `portfolioMonths`, `positions`, `positionAllocations`,
`marketQuotes`, `targetPlans`, `allocationTargets`, `quoteRefreshRuns`,
`quoteRefreshResults`, `dailyQuotes`.

## Restauração

1. `check` confere o arquivo sem gravar e devolve o resumo (contagem por
   tabela, hoje e no arquivo, e o intervalo de competências);
2. `apply`, depois da confirmação, apaga tudo e grava o arquivo numa única
   transação, com os bloqueios da virada de mês, da atualização de cotações e
   das metas padrão; ajusta as sequências dos ids autoincrementais, confere as
   contagens e acrescenta uma linha em `dataImports`. Qualquer falha desfaz
   tudo;
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

## Como mudar o formato

Toda mudança no `prisma/schema.prisma` que acrescente, renomeie ou remova
tabela ou campo precisa passar pelo backup. Exemplo: as transações dentro das
posições, previstas no [backlog](../.ai/context/backlog.md).

1. **Schema e migração**: altere o schema e crie a migração (`pnpm db:migrate`,
   ou `prisma migrate dev --create-only` num schema de teste).
2. **Tabelas**: tabela nova entra em `BACKUP_TABLES`, na posição certa da
   ordem de gravação, e em `TABLE_SPECS`, com o modelo, o
   `Prisma.<Modelo>ScalarFieldEnum`, os campos BigInt em `bigints`, os Json
   opcionais em `nullableJson` e, com id autoincremental, a tabela em `serial`.
   Uma tabela de apoio fica com `label: null`; uma que interessa ao usuário
   ganha um rótulo no resumo da restauração.
3. **Versão**: só campos opcionais ou com valor padrão novos são aceitos por
   arquivos antigos sem conversão, porque a ausência vira o padrão do banco.
   Campo obrigatório novo, campo ou tabela removidos ou renomeados e mudança
   de significado pedem `BACKUP_VERSION` + 1 e um passo em `UPGRADES[versão
   anterior]`, que transforma as tabelas da versão anterior nas da nova (veja
   o passo 1 → 2).
4. **Documento**: acrescente a linha no histórico de versões acima e atualize
   a lista de tabelas.
5. **Teste**: num schema de teste (`pnpm db:test-schema create teste`),
   restaure um backup da versão anterior, exporte de novo e compare as
   tabelas; confira o `tests/e2e/backup.spec.ts` e a ida e volta exata de um
   backup da versão nova.
