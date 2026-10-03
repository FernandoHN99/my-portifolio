# 047 — Fim da importação do Excel: dados só pelo backup em JSON

Estado: concluída em 2026-10-03. Migração aplicada no banco local no mesmo
dia, com `prisma migrate deploy`, depois de um `pg_dump` do schema `public` em
`backups/pre-migracao-047-2026-10-03-1630.dump` (ver
[spec 048](048-default-targets-and-quotes-button.md)).
Definida em: 2026-10-03

## Problema

Pedidos do usuário em 2026-10-03:

- "Pode remover qualquer código referente ao script de importação do excel…
  forma oficial vai ser sempre via import e export do json";
- "Coisas relacionadas ao prisma tb de import_batches, import_issues,
  import_source_rows entendo que não precisa. Tudo o que precisamos seja uma
  forma fácil ou um arquivo .md que consiga fazer a manutenção do modelo de
  importação", para que mudanças futuras, como as transações, o atualizem;
- as versões da configuração passam a mostrar cada importação
  ([spec 045](045-position-page-and-settings-cleanup.md)).

## Comportamento

### Código removido

- roteiros `scripts/import-excel.ts`, `normalize-portfolio.ts`,
  `normalize-allocations.ts`, `verify-new-position-entities.ts` e
  `scripts/history/`, com os comandos `import:excel`, `normalize:*`,
  `verify:new-position` e `history:*`, e a dependência `exceljs`;
- os dados da [spec 041](041-history-preparation.md) em `data/history/`;
  ficam no commit `82b502b`, para consulta;
- o teste `new-position-entities.spec.ts`, coberto pelo
  `position-form.spec.ts` ([spec 043](043-position-form.md)).

A planilha `raw_file/01-Investimentos.xlsm` continua preservada.

### Banco (`prisma/migrations/20261003181428_remove_excel_import/`)

- saem as tabelas `import_batches`, `import_source_rows` e `import_issues`,
  seus enums e os campos de origem: `source_batch_id` (competências e planos
  de metas), `source_row_id` (posições, rateios e cotações) e
  `source_sheet`/`source_cell` (metas);
- entra `data_imports` (`DataImport`): quando cada backup foi importado, a
  data em que foi exportado e a versão do formato.

### Backup, versão 2

- `BACKUP_VERSION` passa a 2, com `dataImports` como primeira tabela e sem as
  tabelas e os campos removidos;
- um arquivo da versão 1 é convertido ao restaurar (`UPGRADES[1]`, em
  `src/modules/backup/application/backup.ts`): as tabelas de importação e os
  campos de origem são descartados;
- toda restauração grava uma linha em `data_imports`, depois dos dados do
  arquivo;
- o resumo da conferência mostra a versão do arquivo.

O formato, as versões e o roteiro para mudá-lo quando o modelo mudar estão em
[docs/backup-format.md](../../docs/backup-format.md), a fonte para manter a
importação e a exportação.

## Verificação

- schema `teste`: o backup v1 do banco real (`backups/meu-portfolio-backup-v1-
  pos-historico.json`, fora do Git) restaurado na versão 2, com todas as
  tabelas iguais às do arquivo, salvo os campos removidos, e a importação
  registrada nas versões;
- `pnpm check` e `pnpm build`;
- Playwright contra o servidor do schema `teste` (porta 3100): 162 passaram,
  12 pulados. Os pulados dependem de cotação editável ou de dados que o
  histórico atual não tem.

## Depois da migração

- banco local com 3 versões de metas, 118 metas e 457 posições, como antes;
- backup v2 dos dados reais em
  `backups/meu-portfolio-backup-2026-10-03-1931.json`, o arquivo para carregar
  outro banco, como o de produção.

## Referências

- [Backup dos dados](042-data-backup.md)
- [Formato do backup](../../docs/backup-format.md)
