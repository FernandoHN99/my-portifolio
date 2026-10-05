# 073 — Página da posição com valor aplicado, rendimento e nova ordem; trilha do topo

Estado: implementada e validada em 2026-10-05; na produção desde o mesmo dia
(deploy `dpl_2QjZJVRfxEEgZ49BkLzYcP1V3uca`).
Origem: pedidos do usuário em 2026-10-05, depois de restaurar o backup com
movimentações ([spec 071](071-backup-with-movements.md)).

## Problemas observados

- **A linha pontilhada do valor aplicado sumiu**, por exemplo no Bitcoin.
  - O cálculo só existia em meses estimados de ativos cotados.
  - Um mês com movimentação registrada zerava a linha, e saldos em reais nunca a
    tinham.
- **Preço médio:** o cálculo era separado e virava "custo desconhecido" quando
  havia saldo inicial.
- **Meses sem movimentação:** depois da primeira movimentação, eles contavam
  como "estimados". Isso gerava "origem mista" e quebrava as séries.
- **Saldo de partida zerado:** com a primeira aplicação registrada como aporte,
  o saldo de partida ficava em R$ 0,00 (Tesouro Renda+, LCD BNDES). Isso foi
  corrigido nos dados, na v2 da spec 071.

## Decisões

### Valor aplicado, rendimento e preço médio

- **Um cálculo só**, um custo médio em ordem de data (`applyMovements`, em
  `domain/position-history.ts`):
  - saldo inicial e aportes somam;
  - uma retirada tira a parte proporcional às unidades (ou ao saldo);
  - um rendimento muda unidades ou saldo, mas não o valor aplicado.
- **O saldo inicial vale como aplicação** pelo valor de entrada:
  - o preço médio existe em toda posição cotada;
  - quando inclui saldo inicial, aparece como "Preço médio com saldo inicial".
- **Rendimento** = valor da posição − valor aplicado.
- **Acompanhamento:** começa na primeira movimentação de cada conta. Depois
  dela, um mês sem movimentações é um mês registrado em que nada entrou nem
  saiu. No legado sem movimentações, continua a estimativa anterior.
- **Arredondamento:** diferenças de centavos não aparecem como "sem registro".
  Entram no preço ou no rendimento.

### Página da posição

Ordem pedida pelo usuário:

1. **Cards:** valor da posição, valor aplicado, rendimento (com o percentual
   sobre o aplicado), variação no mês e participação na carteira.
2. **Evolução da posição**, com a linha pontilhada do valor aplicado em todas as
   posições.
3. **Cotação do ativo**, nas cotadas: preço médio e marcas de aportes e
   retiradas pelo preço executado.
4. **Variação mensal do saldo**, agora em todas as posições, abaixo da cotação.
   Cada barra separa aportes e retiradas do rendimento do mês, que nos cotados
   inclui a variação da cotação.
5. **De onde veio a variação.**
6. **Destaques:** preço médio, melhor mês e pior mês. Saíram Presença, Liquidez
   e Vencimento. Liquidez e vencimento passaram a selos no cabeçalho, junto da
   classificação e da estratégia. O rateio com mais de uma classe fica ao lado.
7. **Mês a mês:** cada linha abre a posição naquela competência.
8. **Movimentações.**

### Topo ("Sweep") e diálogos

- **Ilha escura removida:** a cápsula da [spec 046](046-run-history-and-nav-island.md),
  que destoava das cores do projeto, saiu.
- **Trilha abaixo das abas:** dentro de Posições, a posição ou as cotações
  aparecem numa trilha ("Posições › nome") com a largura da tela, então o nome
  aparece também no celular.
- **Aba Configuração:** ao abrir a Configuração, ela vira uma aba com o mesmo
  destaque de Visão Geral e Posições, e a engrenagem do canto some.
- **Abas fixadas descartadas por ora:** a ideia do usuário de várias posições
  fixadas em abas conflitaria com a linha do tempo dos meses.
- **Botões do diálogo de movimentação:** Cancelar ou Voltar e a ação principal
  ficam juntos à direita, como nos demais diálogos.
- **Backup:** os botões passaram a "Importar backup" e "Exportar backup".

## Verificação

Em 2026-10-05, com o backup v2 restaurado na carteira local:

- **Todas as posições:** uma conferência com as próprias funções do domínio
  passou por 51 posições e 457 competências, sem nenhum problema:
  - todo mês registrado;
  - valor aplicado e rendimento presentes;
  - saldo de partida maior que zero;
  - preço médio em toda posição cotada;
  - nenhuma diferença acima de R$ 0,05.
- **Teste unitário** `tests/unit/position-applied.test.ts`, com 4 cenários:
  saldo inicial, aporte, rendimento positivo e negativo, retirada proporcional,
  staking sem custo e preço médio conhecido.
- **`position-history.spec.ts`:** cards novos, valores da v2, preço médio com
  saldo inicial e liquidez no cabeçalho.
- **`nav-trail.spec.ts`**, no lugar de `nav-island.spec.ts`: trilha abaixo das
  abas, aba Configuração e engrenagem oculta, e o topo cabendo em 320, 360 e
  390 px.
- **Desktop e iPhone 16 Plus:** os 31 cenários desses arquivos passaram nos três
  perfis.
- **Capturas de desktop:** Bitcoin 01, Tesouro Renda+, LCD BNDES, Previdência,
  VOO e Porquinho, mais o topo da Configuração.
- **Verificação geral:** `pnpm check` e 34 testes unitários passaram. A suíte e2e
  completa sobre o `pnpm dev` local, com Chrome, Android e Safari do iPhone,
  teve 247 aprovados e nenhuma falha. Os 108 pulados precisam de um mês aberto
  para editar, e no backup v2 todas as competências estão fechadas.
- **Problema anterior encontrado:** o editor de metas da Configuração transborda
  em telas abaixo de 430 px. É anterior a esta spec e foi corrigido na
  [spec 074](074-settings-narrow-width-overflow.md).

## Arquivos

- `src/modules/portfolio/domain/position-history.ts`
- `src/modules/portfolio/application/get-position-history.ts`
- `src/modules/portfolio/ui/position-detail.tsx`, `position-evolution-chart.tsx`,
  `balance-change-chart.tsx`, `position-months-table.tsx`,
  `position-attribution.tsx`, `position-transactions.tsx`, `maturity-badge.tsx`
- `src/components/product/main-tabs.tsx`, `app-shell.tsx`
- `src/modules/portfolio/ui/position-transaction-dialog.tsx`, `src/modules/backup/ui/backup-panel.tsx`
