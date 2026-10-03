# 042 — Backup dos dados: exportar e restaurar

Estado: concluída em 2026-10-03. Na [spec 047](047-json-only-data.md) o
formato passou à versão 2, sem as tabelas da importação do Excel e com o
registro das importações; o formato é mantido em
[docs/backup-format.md](../../docs/backup-format.md).
Definida em: 2026-10-03

## Problema

Pedido do usuário em 2026-10-03, ao responder às perguntas da
[spec 041](041-history-preparation.md): "crie dentro da aplicação uma forma de
importar e exportar um arquivo para backup dos dados, isso é muito útil". E,
para testar: "pode criar schemas dentro do Postgres atual para ir testando e
ver se funciona".

## Comportamento

### Na Configuração

O painel "Backup dos dados" fica no fim da coluna das metas
(`src/modules/backup/ui/backup-panel.tsx`) e também aparece sem metas, como
num banco vazio, para restaurar uma instalação nova:

- **Exportar backup** baixa `meu-portfolio-backup-AAAA-MM-DD-HHMM.json` (UTC)
  pela rota `GET /api/backup`, que recusa pedidos de outro site;
- **Restaurar backup** lê o arquivo, confere no servidor (`POST
  /api/backup/restore` com `mode: "check"`, sem gravar) e abre o diálogo
  "Restaurar este backup?", com a data da exportação, o intervalo de
  competências e, lado a lado, quantos registros há hoje e no arquivo. Só
  "Restaurar" grava (`mode: "apply"`); depois aparece o aviso "Backup
  restaurado" e a tela recarrega os dados;
- um arquivo que não é JSON ou não é backup mostra o motivo no painel, sem
  abrir o diálogo.

É rota, e não Server Action, porque o arquivo passa do limite de 1 MB das
actions (hoje tem cerca de 1,5 MB).

### Formato

JSON versionado (`src/modules/backup/domain/backup-format.ts`): `format`
`meu-portfolio-backup`, `version` 1, `exportedAt` e `tables`, com as 17
tabelas do schema, inclusive os lotes da importação do Excel (as metas
importadas dependem deles), o histórico diário de cotações e as execuções de
atualização. Datas e decimais vão como texto; BigInt, como texto convertido de
volta pela lista `bigints` de cada tabela.

### Exportação e restauração (`src/modules/backup/application/backup.ts`)

- a exportação lê tudo numa transação `RepeatableRead`, em ordem de id;
- a restauração recusa outro formato, versão mais nova, tabela ou campo que o
  app não conhece; aceita tabela ausente (backup mais antigo) como vazia;
- grava numa única transação, com os bloqueios da virada de mês e da
  atualização de cotações (`src/lib/advisory-locks.ts`): apaga na ordem
  inversa das dependências, grava com os mesmos ids, ajusta as sequências dos
  ids autoincrementais e confere a contagem de cada tabela. Qualquer falha
  desfaz tudo;
- uma atualização de cotações já em andamento durante a restauração pode
  falhar ao gravar; a restauração em si fica íntegra.

### Pelo terminal

- `pnpm backup:export [arquivo]`: grava em `backups/` (ignorado pelo Git, por
  ter dados pessoais) quando sem arquivo;
- `pnpm backup:restore <arquivo>`: confere e mostra o resumo; com
  `-- --apply`, substitui.

### Schemas de teste

- `src/lib/prisma.ts` passou a respeitar `?schema=` na `DATABASE_URL`, no
  adaptador e no `search_path`; sem ele, nada muda;
- `pnpm db:test-schema create|url|drop <nome>` cria um schema com as
  migrações, mostra a URL dele ou o apaga, sem nunca aceitar `public`;
- `E2E_BASE_URL` aponta o Playwright para um servidor já rodando, sem subir o
  dev; a configuração `teste-schema` do `.claude/launch.json` sobe o build na
  porta 3100 ligado ao schema `teste_backup` (desde a
  [spec 047](047-json-only-data.md), ao schema `teste`).

## Verificação

- ida e volta no schema `teste_backup`: backup do banco real (17 tabelas, 904
  linhas de origem do Excel, 385 posições), restaurado e exportado de novo,
  com as 17 tabelas idênticas; sequência de `import_source_rows` em 905;
- tela, no servidor de teste: exportar, conferir um backup com uma cotação
  diária a menos (312 hoje, 311 no backup), restaurar e ver o aviso "Backup
  restaurado · 41 competências e 457 posições"; o banco de teste ficou com
  311;
- rota: arquivo de 1,5 MB conferido em 57 ms; campo desconhecido, outro
  formato e pedido de outro site recusados;
- `tests/e2e/backup.spec.ts`: exportação, conferência com cancelamento e
  arquivos recusados, sem gravar nos dados reais;
- `pnpm check`, `pnpm build` e a suíte do Playwright contra o servidor de
  teste (151 passaram, 11 pulados).

## Referências

- [Histórico completo para a importação](041-history-preparation.md)
- [Configuração da carteira](014-target-settings.md)
