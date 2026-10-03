# Specs

Esta pasta organiza a implementação em fatias pequenas e revisáveis.

## Índice

- [001 — Fundação da aplicação](001-foundation.md): concluída.
- [002 — Importação auditável do Excel](002-excel-import.md): concluída.
- [003 — Atualização mensal manual](003-manual-monthly-update.md): concluída.
- [004 — Shell visual dark e revisão](004-dark-product-shell.md): concluída.
- [005 — Domínio inicial da carteira](005-portfolio-domain.md): concluída.
- [006 — Edição das posições do rascunho](006-draft-position-editing.md): concluída.
- [007 — Classificações e metas de alocação](007-allocation-data.md): concluída.
- [008 — Tela de alocação](008-allocation-view.md): concluída.
- [009 — Rótulo e valor de rebalanceamento](009-rebalance-labels.md): concluída.
- [010 — Navegação no topo e seletor global de mês](010-global-shell-month-selector.md): concluída.
- [011 — Visão Geral](011-overview-tab.md): concluída.
- [012 — Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md): concluída.
- [013 — Posições: filtros e consulta](013-positions-filters.md): concluída.
- [014 — Configuração da carteira](014-target-settings.md): concluída.
- [015 — Transições sem recarregamento](015-seamless-transitions.md): concluída.
- [016 — Histórico de uma posição e de um ativo](016-position-history.md): concluída.
- [017 — Posições: edição](017-positions-editing.md): concluída.
- [018 — Faixa de tolerância ajustável](018-adjustable-tolerance.md): concluída.
- [019 — Modo de edição com lápis](019-pencil-edit-mode.md): concluída.
- [020 — Cotações diárias e atualização ao abrir](020-daily-quotes.md): concluída.
- [021 — Virada de mês automática](021-automatic-month-rollover.md): concluída.
- [022 — Página de cotações em Posições](022-quotes-page.md): concluída.
- [023 — Linha do tempo compacta](023-compact-month-timeline.md): concluída.
- [024 — Visão Geral: duração, variação no período e hover](024-overview-adjustments.md): concluída.
- [025 — Listas de seleção estilizadas](025-styled-pickers.md): concluída.
- [026 — Inclusão de posição com conta, instituição, ativo e vencimento novos](026-new-position-entities.md): concluída.
- [027 — Ajustes na configuração de metas](027-target-settings-adjustments.md): concluída.
- [028 — Regras de cotação: fechamento, edição restrita e histórico global](028-quote-rules.md): concluída.
- [029 — Histórico de 3 anos ao incluir um ativo](029-asset-price-history.md): concluída.
- [030 — Visão Geral: meses do calendário, início do período e metas sem posição](030-overview-calendar-comparisons.md): concluída.
- [031 — Posições: vencimento, filtros em cascata e campos de 16 px](031-positions-cascading-filters.md): concluída.
- [032 — Finalizar o mês corrente](032-finalize-current-month.md): substituída pela 034.
- [033 — Escolha da moeda da CoinGecko na inclusão de cripto](033-coingecko-coin-choice.md): concluída.
- [034 — Mês aberto ou fechado na linha do tempo](034-open-closed-months.md): concluída.
- [035 — Resgate fixo e classes existentes no rateio](035-redemption-and-known-classes.md): concluída.
- [036 — Altcoins como moeda base](036-altcoins-currency.md): concluída.
- [037 — Provedores de cotação em cadeia, com Yahoo, Binance e PTAX](037-quote-provider-chains.md): concluída.
- [038 — Gráficos para daltonismo, sem contorno, e card da atualização só no mês corrente](038-colorblind-charts.md): concluída.
- [039 — Prazo de liquidez do ativo](039-asset-liquidity.md): concluída.
- [040 — Inclusão pelo tipo, nome livre, renomear ativo, sem conta, e cor da diferença](040-simpler-position-entry.md): concluída.

As specs 010 a 017 formam a reestruturação da UX pedida pelo usuário. O
propósito, as restrições e as regras de cálculo comuns a elas estão em
[Reestruturação da UX](../context/ux-restructure.md). A ordem de execução
acordada está registrada lá, e não segue a numeração: depois da 012 vem a
015, depois a 013, a 017 e a 014.

Cada spec deve preservar o problema, objetivo, requisitos,
restrições, comportamento esperado, decisões tomadas, referências
arquiteturais e estado de implementação, quando aplicável.

Cada spec recebe um número sequencial e registra seu estado. Novas specs
devem ser criadas somente quando a fatia correspondente estiver definida.

Referencie descobertas de `../context/` e documentação de `../../docs/`
quando forem relevantes. Ao consolidar um assunto, mantenha uma
fonte principal e atualize as referências anteriores.
