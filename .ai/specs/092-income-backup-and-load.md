# 092 — Backup de Recebimentos e carga da planilha

Estado: implementada em 2026-10-07; carga feita no banco local, na conta
`nandohneto@gmail.com`. Na produção, o usuário importa o arquivo pela página
(decisão dele em 2026-10-07).
Origem: pedido do usuário em 2026-10-07. Numerada depois das specs 090 e 091,
criadas em paralelo por outro agente.

## Decisões

- **Arquivo próprio** (formato `meu-portfolio-recebimentos`, versão 1, tabelas
  `incomeMonths` e `incomePayslips`; [formato](../../docs/backup-format.md)),
  separado da carteira e de Gastos familiares: restaurar um nunca apaga os
  outros. Conferência estrita, como a da spec 084 (campo ou tabela
  desconhecidos, `userId`, mês repetido, holerite fora do mês ou referência
  quebrada recusam o arquivo antes de gravar). A Previdência não tem tabelas
  próprias, então não tem backup.
- **Portas:** botão "Backup" em Recebimentos, `GET /api/recebimentos/backup`,
  `POST /api/recebimentos/backup/restore` (`check` e `apply`) e
  `pnpm income:backup export|restore --user <e-mail> [--apply]`. Todas pedem
  a concessão `INCOME`. Bloqueio próprio (`INCOME_RESTORE_LOCK_KEY`).

Em 2026-10-08, a [spec 094](094-income-hours-model.md) levou o formato à versão
2 (tabela `incomeHourRecords`); o arquivo da versão 1 continua aceito.

## Carga da planilha (2026-10-07)

Arquivo `backups/recebimentos/recebimentos-planilha-2026-10-07.backup.json`
(fora do Git), gerado das tabelas coladas pelo usuário, com ids estáveis:

- 21 meses: Jan a Set/26 com entradas e saídas (Set só com VA/VR R$ 1.100) e
  os doze meses de 2025 só com holerite;
- 24 holerites de jan/25 a set/26, com a correção do usuário (agosto/26 de
  01/08 a 31/08) e as férias de setembro (08/09 a 13/09, R$ 1.989,39) com o
  tipo Férias; março/25 e maio/25 com duas linhas pela troca de emprego.

Simulação local: 0 → 21 meses e 0 → 24 holerites; aplicada na conta local, sem
tocar na carteira (82 competências no banco) nem nos gastos (511 lançamentos).
O mesmo arquivo foi carregado no usuário de teste do schema `recebimentos_teste`.

## Produção

Depois do deploy, a migração grava as concessões `INCOME` e `PENSION` para a
conta do dono. O usuário importa o arquivo em Recebimentos → Backup →
Importar backup (ou, com a conexão direta, `pnpm income:backup restore --user
nandohneto@gmail.com <arquivo> --apply`).
