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
- [016 — Histórico de uma posição e de um ativo](016-position-history.md): planejada, sem prazo.
- [017 — Posições: edição](017-positions-editing.md): concluída.
- [018 — Tolerância ajustável](018-adjustable-tolerance.md): em andamento.

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
