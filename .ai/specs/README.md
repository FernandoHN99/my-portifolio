# Specs

Esta pasta organiza a implementação em fatias pequenas e revisáveis.

## Índice

- [001 — Fundação da aplicação](001-foundation.md): concluída.
- [002 — Importação auditável do Excel](002-excel-import.md): concluída; removida pela 047.
- [003 — Atualização mensal manual](003-manual-monthly-update.md): concluída; tabelas removidas pela 049.
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
- [019 — Modo de edição com lápis](019-pencil-edit-mode.md): concluída; substituída pela 043.
- [020 — Cotações diárias e atualização ao abrir](020-daily-quotes.md): concluída; a atualização manual saiu na 051.
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
- [041 — Histórico completo para a importação (passo pré-produção)](041-history-preparation.md): concluída.
- [042 — Backup dos dados: exportar e restaurar](042-data-backup.md): concluída.
- [043 — Formulário único da posição, lápis e lixeira na linha](043-position-form.md): concluída.
- [044 — Tabela de Posições enxuta, classes, expansão e filtros da esquerda para a direita](044-compact-positions-table.md): concluída.
- [045 — Página da posição com rateio discreto e configuração sem Excel](045-position-page-and-settings-cleanup.md): concluída.
- [046 — Histórico de execuções do mês e ilha do topo](046-run-history-and-nav-island.md): concluída.
- [047 — Fim da importação do Excel: dados só pelo backup em JSON](047-json-only-data.md): concluída.
- [048 — Metas padrão, cotações em Posições e abas com cadeado](048-default-targets-and-quotes-button.md): concluída.
- [049 — Limpeza do modelo: tabelas e status sem uso](049-model-cleanup.md): concluída.
- [050 — Login e dados por usuário](050-login-and-user-data.md): concluída.
- [051 — Cotações automáticas compartilhadas, à mão por usuário e só atualização automática](051-shared-automatic-quotes.md): concluída.
- [052 — Backup por usuário no novo modelo](052-per-user-backup.md): concluída.
- [053 — Cotações atualizadas por um job agendado, fora da navegação](053-scheduled-quote-sync.md): concluída; na produção, como função do Neon em `aws-us-east-1`, de hora em hora.
- [054 — Moeda sobre o total calculada e metas sem versões](054-derived-currency-and-single-target-plan.md): concluída; na produção desde 2026-10-04.
- [055 — Carteira vazia: incluir a primeira posição ou restaurar um backup](055-empty-portfolio-start.md): concluída; na produção desde 2026-10-04.
- [056 — Transações nas posições: base do mês, saldo inicial e correção sem cascata](056-position-transactions.md): concluída; na produção desde 2026-10-04.
- [057 — Formulário de movimentação e lápis só de atributos](057-movement-form-and-attribute-pencil.md): concluída; na produção desde 2026-10-04.
- [058 — Histórico e indicadores por movimentações](058-transaction-history-and-indicators.md): concluída; na produção desde 2026-10-04.
- [059 — Conta corrente e liquidação de títulos vencidos](059-cash-account-and-liquidation.md): concluída; na produção desde 2026-10-04.
- [060 — Renda fixa a percentual do CDI, cálculo bruto](060-cdi-fixed-income.md): implementação anterior concluída; cálculo suspenso localmente pela 065, a pedido do usuário.
- [061 — Tesouro Direto por quantidade e preço oficial](061-treasury-direct-quotes.md): na produção desde 2026-10-04; falta uma inclusão real gravada.
- [062 — Revisão mobile com referência no Safari do iPhone 16 Plus](062-iphone-mobile-review.md): emulação concluída e na produção desde 2026-10-04; falta o aparelho físico.
- [063 — Conferência de ticker entre consulta e salvamento](063-ticker-verification-during-save.md): concluída localmente; XRP entre processos, cotação atual na inclusão e histórico somente no job.
- [064 — Meta Selic informativa e atualização local das cotações](064-selic-and-dev-quotes.md): concluída localmente; taxa diária nas duas telas e botão só em desenvolvimento.
- [065 — Renda fixa por movimentações manuais](065-manual-fixed-income.md): concluída localmente; avaliação automática pausada, saldos e metadados preservados.
- [066 — Inclusão e movimentação por etapas obrigatórias](066-guided-position-and-movement-dialogs.md): concluída localmente; protótipo validado antes da implementação, inclusão simplificada e prévia antes de registrar.
- [067 — Selic de cada competência no card do dólar](067-selic-per-month.md): concluída localmente; substitui o card próprio da 064, com histórico da meta.
- [068 — Classificação fixa da planilha e tipo do ativo](068-fixed-classification-and-asset-type.md): concluída localmente; listas dependentes, coluna, filtro e painel por tipo.
- [069 — Campo de data do design system e listas do diálogo de movimentação](069-date-picker-and-dialog-pickers.md): concluída localmente.
- [070 — Tesouro Direto com preço próprio e valor em reais](070-treasury-own-value.md): concluída localmente; catálogo carregado já na escolha do tipo.
- [071 — Backup convertido com movimentações](071-backup-with-movements.md): v2 com as regras de 2026-10-05 e o relatório do Inter, restaurada na carteira local; fora do Git.
- [072 — Branch dev e ferramentas só do desenvolvimento](072-dev-branch-and-local-tools.md): concluída localmente; inclui a causa do CSS corrompido no `pnpm dev`.
- [073 — Página da posição com valor aplicado, rendimento e nova ordem; trilha do topo](073-position-page-applied-value-and-nav-trail.md): concluída; na produção desde 2026-10-05.
- [074 — Configuração sem rolagem horizontal em telas estreitas](074-settings-narrow-width-overflow.md): concluída em 2026-10-05, na `dev`; coluna da grade, matriz de renda fixa e prévia ajustadas de 320 a 430 px.
- [075 — Página da posição mais limpa, sem textos explicativos e com os meses da posição](075-position-page-cleanup-and-month-strip.md): concluída localmente em 2026-10-05; seções recolhidas, destaques no card da variação, períodos na variação mensal, sem conta corrente no formulário.
- [076 — Liquidação de posições](076-position-liquidation.md): concluída localmente em 2026-10-05; retirada total que preserva o histórico, rendimento com o realizado e backup v3 com as liquidações antigas.
- [077 — Topo ligado à posição, filtros do celular e abas sem arraste](077-header-trail-and-mobile-filters.md): concluída localmente em 2026-10-06; folha de filtros no celular e troca de aba só pelo toque (as setas do topo saíram na 078).
- [078 — Alocação por abas na Visão geral, virada com confirmação e gráficos de toque](078-overview-allocation-tabs-and-touch-charts.md): concluída localmente em 2026-10-06; gráfico e comprar e vender pela mesma aba, confirmação antes de criar o mês, indicação que some ao tirar o dedo, movimentações completas na posição.

As specs 063 a 073 são revisões posteriores de 2026-10-04 e 2026-10-05, no
`main` e na produção desde 2026-10-05 ([Produção](../context/production.md)).
As specs 074 a 078 estão na `dev`, ainda fora da produção.

Conferência conjunta das specs 063 a 072, em 2026-10-05:

- `pnpm check`, 30 testes unitários e o build de produção, numa pasta `.next-*`
  separada, passaram;
- a suíte e2e completa, sobre o `pnpm dev` local (Chrome, Android e Safari do
  iPhone): 329 aprovados, 22 pulados por falta de mês aberto ou de dado, e 4
  falhas corrigidas e repetidas com sucesso:
  - o teste antigo que proibia qualquer botão "Atualizar cotações" passou a
    ignorar o botão "(dev)";
  - o teste novo do Tesouro, instável no WebKit, passou a esperar o campo de
    preço.

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
