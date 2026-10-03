# 049 — Limpeza do modelo: tabelas e status sem uso

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedido do usuário em 2026-10-03: "Verificar se todas as tabelas atuais do
projeto realmente são utilizadas, se não tem nenhum resto".

## Levantamento

Feito em 2026-10-03 sobre o `main` (commit `1aef8bf`), comparando o
`prisma/schema.prisma`, o banco local e o uso de cada modelo e coluna no código:

| Item | Uso encontrado | Origem |
|---|---|---|
| `monthly_update_runs` | só lida pela trava do desfazer de "excluir competência" e copiada pelo backup; nada grava | atualização mensal manual da [spec 003](003-manual-monthly-update.md), substituída pela virada automática da [spec 021](021-automatic-month-rollover.md) |
| `quote_update_results` | só copiada pelo backup | idem |
| enum `MonthlyUpdateStatus` | só dessas tabelas | idem |
| status `IMPORTED` de `PortfolioMonth` | valor padrão da coluna; nenhum código o lê; 39 meses do backup de 2026-10-03 o têm, e a tela os trata como fechados, igual a `REVIEWED` | importação do Excel, removida na [spec 047](047-json-only-data.md) |

As duas tabelas estavam vazias no banco local e no backup mais recente
(`backups/meu-portfolio-backup-2026-10-03-2016.json`). As demais tabelas e
colunas têm leitura ou gravação no código; `data_imports.format_version` é só
gravada, como registro da restauração, e fica.

## Comportamento

- saem as tabelas `monthly_update_runs` e `quote_update_results`, o enum
  `MonthlyUpdateStatus` e as relações `sourceUpdates` e `targetUpdate`;
- o desfazer de uma competência criada deixa de conferir a atualização mensal;
- `PortfolioMonthStatus` fica com `DRAFT` (aberto) e `REVIEWED` (fechado); a
  migração converte `IMPORTED` em `REVIEWED`, o novo padrão da coluna;
- o backup passa para a versão 3: um arquivo da versão 2 perde as duas tabelas
  e tem os meses `IMPORTED` convertidos em `REVIEWED`
  ([Formato do backup](../../docs/backup-format.md)).

## Critérios de aceite

- `pnpm check` e `pnpm build` passam;
- a migração roda num banco com dados e num banco vazio;
- um backup da versão 2 é restaurado, e a exportação seguinte sai na versão 3
  sem as tabelas removidas.

## Verificação

Em 2026-10-03:

- `pnpm typecheck` passou depois do `pnpm db:generate`;
- a migração `20261003210000_model_cleanup` rodou no banco local com os dados:
  os 39 meses `IMPORTED` passaram a `REVIEWED`, e os 2 abertos ficaram `DRAFT`;
- num schema de teste, o backup `meu-portfolio-backup-2026-10-03-2016.json`
  (versão 2) foi restaurado e exportado de novo: saiu na versão 3, com 13
  tabelas, e cada linha igual à do arquivo, salvo o status convertido.
