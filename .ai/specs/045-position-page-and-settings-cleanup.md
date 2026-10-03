# 045 — Página da posição com rateio discreto e configuração sem Excel

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedidos do usuário em 2026-10-03:

- "Remova o 'Fora da meta' dos itens";
- na página da posição, "o componente de Rateio quando for 100% nem precisa
  exibir aí deixa a cotação na tela toda. ou melhor se quiser deixar alguma
  indicação mínima do rateio 100% mas algo sutil";
- "Remova a opção 'Restaurar padrão do Excel'";
- "Pode manter o componente de versões, sempre que houver uma nova
  importação aí exibe que houve uma nova mudança!"

## Comportamento

### Página da posição (`src/modules/portfolio/ui/position-detail.tsx`)

- com uma classificação só, de 100%, o painel de rateio sai: um selo
  discreto no cabeçalho mostra "Classe · Subclasse · Resgate 100%"
  (`position-single-allocation`), e o gráfico da cotação ocupa a largura toda;
- com mais de uma, os selos mostram as classes e o painel de rateio continua
  ao lado do gráfico;
- liquidez e vencimento aparecem como linhas de destaque, o vencimento só
  para saldos e para ativos em dólar.

### Configuração

- sem "Restaurar padrão do Excel" e sem a contagem "Fora da meta"
  (`target-editor.tsx`, `target-plan-editing.ts`, `rebalance.ts`);
- a lista de versões mostra, além das metas salvas, cada importação de backup
  ("Backup importado", com a data em que o arquivo foi exportado), ordenadas
  pela data; são as 12 mais recentes (`get-target-editor.ts`). As importações
  vêm da tabela `data_imports` ([spec 047](047-json-only-data.md));
- o painel de backup fica no fim da coluna das metas e também no estado
  vazio.

## Testes

- `tests/e2e/position-history.spec.ts`: selo de rateio único;
- `tests/e2e/target-settings-adjustments.spec.ts`: sem restaurar o padrão da
  planilha e sem "Fora da meta";
- `tests/e2e/backup.spec.ts`: versão 2 e `dataImports` no arquivo.

## Referências

- [Histórico de uma posição](016-position-history.md)
- [Ajustes na configuração de metas](027-target-settings-adjustments.md)
