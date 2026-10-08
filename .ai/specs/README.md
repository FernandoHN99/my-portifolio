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
- [060 — Renda fixa a percentual do CDI, cálculo bruto](060-cdi-fixed-income.md): implementação anterior concluída; suspensa pela 065 e retomada por ativo na 079.
- [061 — Tesouro Direto por quantidade e preço oficial](061-treasury-direct-quotes.md): na produção desde 2026-10-04; falta uma inclusão real gravada.
- [062 — Revisão mobile com referência no Safari do iPhone 16 Plus](062-iphone-mobile-review.md): emulação concluída e na produção desde 2026-10-04; falta o aparelho físico.
- [063 — Conferência de ticker entre consulta e salvamento](063-ticker-verification-during-save.md): concluída localmente; XRP entre processos, cotação atual na inclusão e histórico somente no job.
- [064 — Meta Selic informativa e atualização local das cotações](064-selic-and-dev-quotes.md): concluída localmente; taxa diária nas duas telas e botão só em desenvolvimento.
- [065 — Renda fixa por movimentações manuais](065-manual-fixed-income.md): concluída; a pausa global foi substituída pela flag por ativo da 079.
- [066 — Inclusão e movimentação por etapas obrigatórias](066-guided-position-and-movement-dialogs.md): concluída localmente; protótipo validado antes da implementação, inclusão simplificada e prévia antes de registrar.
- [067 — Selic de cada competência no card do dólar](067-selic-per-month.md): concluída localmente; substitui o card próprio da 064, com histórico da meta.
- [068 — Classificação fixa da planilha e tipo do ativo](068-fixed-classification-and-asset-type.md): concluída localmente; listas dependentes, coluna, filtro e painel por tipo.
- [069 — Campo de data do design system e listas do diálogo de movimentação](069-date-picker-and-dialog-pickers.md): concluída localmente.
- [070 — Tesouro Direto com preço próprio e valor em reais](070-treasury-own-value.md): concluída localmente; catálogo carregado já na escolha do tipo.
- [071 — Backup convertido com movimentações](071-backup-with-movements.md): v2 com as regras de 2026-10-05 e o relatório do Inter, restaurada na carteira local; fora do Git.
- [072 — Branch dev e ferramentas só do desenvolvimento](072-dev-branch-and-local-tools.md): concluída localmente; inclui a causa do CSS corrompido no `pnpm dev`.
- [073 — Página da posição com valor aplicado, rendimento e nova ordem; trilha do topo](073-position-page-applied-value-and-nav-trail.md): concluída; na produção desde 2026-10-05.
- [074 — Configuração sem rolagem horizontal em telas estreitas](074-settings-narrow-width-overflow.md): concluída em 2026-10-05, na produção desde 2026-10-06; coluna da grade, matriz de renda fixa e prévia ajustadas de 320 a 430 px.
- [075 — Página da posição mais limpa, sem textos explicativos e com os meses da posição](075-position-page-cleanup-and-month-strip.md): concluída localmente em 2026-10-05; seções recolhidas, destaques no card da variação, períodos na variação mensal, sem conta corrente no formulário.
- [076 — Liquidação de posições](076-position-liquidation.md): concluída localmente em 2026-10-05; retirada total que preserva o histórico, rendimento com o realizado e backup v3 com as liquidações antigas.
- [077 — Topo ligado à posição, filtros do celular e abas sem arraste](077-header-trail-and-mobile-filters.md): concluída localmente em 2026-10-06; folha de filtros no celular e troca de aba só pelo toque (as setas do topo saíram na 078).
- [078 — Alocação por abas na Visão geral, virada com confirmação e gráficos de toque](078-overview-allocation-tabs-and-touch-charts.md): concluída localmente em 2026-10-06; gráfico e comprar e vender pela mesma aba, confirmação antes de criar o mês, indicação que some ao tirar o dedo, movimentações completas na posição.
- [079 — Rendimento automático como nos bancos, prefixado e filtros das movimentações](079-auto-income-prefixed-and-movement-filters.md): na produção desde 2026-10-06, inclusive no job do Neon; flag por ativo, rentabilidade em cada classificação, CDI diário × % e prefixado em base 252 com feriados, Prefixado nas subclasses e metas, filtros por tipo nas movimentações.
- [080 — Ações só na página da posição e ajustes do celular](080-position-actions-on-page-and-mobile-trims.md): na produção desde 2026-10-06; ações na página, remover com desfazer na tabela inclusive na última posição, prévia das metas oculta no celular, comprar e vender enxuto e filtro próprio do rendimento automático.
- [081 — Acesso por área e menu lateral](081-module-access-and-area-navigation.md): na produção desde 2026-10-07; concessões por área e papéis no servidor, barra lateral recolhível e hambúrguer só para quem tem mais de uma área.
- [082 — Gastos familiares: lançamentos, filtros, resumo e acerto](082-family-expenses-ledger.md): na produção desde 2026-10-07; tabela da planilha com saldo por pessoa, filtros combinados na URL e acerto em lote atômico.
- [083 — Parcelas e lançamentos mensais em Gastos familiares](083-family-expense-series.md): na produção desde 2026-10-07; séries geradas na criação e editáveis inteiras, com os acertados protegidos.
- [084 — Backup de Gastos familiares e carga inicial](084-family-expenses-backup-and-load.md): na produção desde 2026-10-07; arquivo próprio, conversão da planilha reconciliada e carga local na conta do dono.

- [085 — Ajustes da navegação e da lista de gastos familiares](085-family-ledger-and-navigation-polish.md): na produção desde 2026-10-07; abas centralizadas e discretas, lançamentos por mês sem checkboxes e filtros dependentes.

- [086 — Pessoa única e seleção de meses em Gastos familiares](086-family-person-and-month-selection.md): na produção desde 2026-10-07; badges alfabéticos de pessoa única, mês atual automático e alternância de meses únicos/múltiplos, sem quadro de saldo por pessoa.

- [087 — Organização dos gastos e reversão de acertos](087-family-ledger-layout-and-reopen.md): na produção desde 2026-10-07; cards antes dos filtros, menu compacto, indicadores sem pendências e reversão com Desfazer.

- [088 — Recebimentos](088-income-ledger.md): entradas, saídas e balanço do mês, gráfico Gastos × Poupado e holerites do mês, por concessão.
- [089 — Previdência](089-pension-pgbl-limit.md): limite de 12% do PGBL por ano-base, com os holerites de Recebimentos e os aportes das posições de previdência.
- [090 — Cores e linguagem visual compartilhadas](090-shared-visual-language.md): guia de estilos obrigatório, valores e formulários coerentes entre áreas, paleta acessível dos gráficos preservada.
- [091 — Ano inteiro e controles compactos](091-family-person-first-and-year-strip.md): doze meses por ano na faixa de Gastos familiares, meses acima das pessoas (pedido de inversão retirado pelo usuário) e lista, cabeçalho e ícone compactos.
- [092 — Backup de Recebimentos e carga da planilha](092-income-backup-and-load.md): arquivo próprio e carga de 21 meses e 24 holerites; na produção, o usuário importa.
- [093 — Reservas na cotação de cripto](093-crypto-quote-fallbacks.md): nova tentativa na CoinGecko e Coinbase, Yahoo e Binance como reservas, por causa do 451 e dos tempos esgotados na região do job; pronta localmente, sem publicação.
- [094 — Horas do mês em Recebimentos](094-income-hours-model.md): tabela `income_hour_records` (horas declaradas, pagas e trabalhadas por tipo e mês, sem tela), backup de Recebimentos na versão 2 e arquivo de carga dos 11 holerites de 2026 com o 13º de junho; pronta localmente, sem publicação.
- [095 — Holerite tributável](095-payslip-taxable-flag.md): campo `taxable` em cada linha do holerite (checkbox no formulário, padrão pelo tipo), Previdência seguindo a marcação, bruto tributável no card Salário bruto e backup de Recebimentos na versão 3; pronta localmente, sem publicação.

As specs 088 a 092 foram feitas em 2026-10-07 (a 090 e a 091 começadas por
outro agente em paralelo) e conferidas juntas: lint, tipos, 78 testes
unitários, integração de Gastos familiares (10) e de Recebimentos (8), e2e das
três áreas nos três perfis e o build de produção.

As specs 063 a 073 são revisões posteriores de 2026-10-04 e 2026-10-05, no
`main` e na produção desde 2026-10-05 ([Produção](../context/production.md)).
As specs 074 a 078 estão no `main` e na produção desde 2026-10-06
(deploy `dpl_Cd6RUzGWBe9kVnPcqTevpKq4RP1T`).
As specs 079 e 080 foram publicadas em 2026-10-06 com o commit `e2fa3c3`
(deploy `dpl_HUFFir3tGM9xTKXgTrZyTCQnqS8B`), seguido do deployment 4 da função
`quotesync` do Neon ([Produção](../context/production.md)).

As specs 081 a 087 (áreas e Gastos familiares, sob Finanças) foram feitas em
2026-10-07 a partir do [prompt de continuidade](../context/gastos-familia-prompt.md)
e publicadas no mesmo dia com os commits `1249ee4` e `341786b` (deploy
`dpl_3sRsmdbo1ms9wEamMbKkUiEy1pRy`), com a carga dos 494 lançamentos na conta
do dono ([Produção](../context/production.md)).

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
