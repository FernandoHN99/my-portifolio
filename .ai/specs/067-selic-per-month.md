# 067 — Selic de cada competência no card do dólar

Estado: implementada e validada localmente em 2026-10-05. Sem commit ou deploy.
Origem: pedido do usuário em 2026-10-04, depois da spec 064: "deixar o
componente da taxa Selic dentro do componente do dólar, de modo que tenhamos a
taxa Selic mudando por mês; não precisamos de um componente inteiro só para a
Selic".

## Decisão

- O card próprio da Selic (`SelicReferenceCard`, spec 064) saiu.
- Na Visão geral, a Selic entra no card de cotações do mês, ao lado de "Dólar no
  mês" e "Bitcoin no mês", como "Selic no mês".
- Nas Cotações, ela aparece ao lado do total da competência, no cabeçalho.
- A taxa é a da competência escolhida: num mês passado, a meta vigente no último
  dia; no mês corrente, a de hoje. Continua informativa (spec 064): não remunera
  posições.

## Histórico da meta

- Tabela compartilhada `reference_rate_points` (`ReferenceRatePoint`): chave
  `SELIC_TARGET`, dia em que a taxa passou a valer e percentual ao ano. Um ponto
  por mudança da taxa, não por dia.
- Migração aditiva `20261005090000_selic_history_and_asset_type`, que também
  cria a coluna da spec 068.
- Fica fora do backup, como `reference_rates`: dado público, recarregável pelo
  job.
- O job (`syncSelicReference`) mantém a cadência de uma tentativa por 24 horas e
  a reserva sob bloqueio consultivo.
  - A primeira carga traz dez anos da SGS 432, o limite de uma consulta da API.
  - As seguintes buscam desde a última observação.
  - Só as mudanças da taxa viram pontos (`selicChangePoints`).
- Sem histórico ainda, como logo depois desta spec, a carga não espera as 24
  horas, desde que a última tentativa tenha terminado com sucesso. Uma tentativa
  em andamento ou uma falha registrada continuam esperando.
- Leitura: `getSelicForMonth(referenceDate)` lê o último ponto até o dia da
  competência, sem consultar o Banco Central. A tela marca "última disponível"
  quando o dia pedido passa da última observação.

## Verificação

Em 2026-10-05:

- `tests/unit/selic-reference.test.ts`, 8 cenários aprovados:
  - pontos só nas mudanças;
  - janela de dez anos na primeira carga;
  - carga sem esperar 24 horas quando falta histórico;
  - concorrência, falha e o endpoint de produção.
- Carga real no banco local, só nas tabelas de taxas: 53 mudanças em dez anos,
  observação de 2026-10-04.
  - Dez/2024 mostra 12,25%; set/2025, 15%; set/2026 e out/2026, 13,75%.
- `tests/e2e/selic-reference.spec.ts`: Selic no card do dólar e nas Cotações,
  data da competência no texto de apoio, valor diferente entre dez/2024 e
  set/2026, nenhuma requisição do navegador ao Banco Central.
- Capturas de desktop e do iPhone 16 Plus (WebKit) conferidas: o card do dólar
  com quatro itens quebra em duas linhas no celular, sem estourar a largura.

## Arquivos

- `src/modules/quotes/infrastructure/bcb-selic.ts` (`SelicHistory`, `selicChangePoints`)
- `src/modules/quotes/application/selic-reference.ts` (`getSelicForMonth`, `syncSelicReference`)
- `src/modules/quotes/presentation/selic-format.ts`
- `src/modules/portfolio/ui/overview-kpis.tsx`, `src/modules/quotes/ui/quotes-workspace.tsx`
