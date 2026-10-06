# 077 — Topo ligado à posição, filtros do celular e abas sem arraste

Estado: implementada e validada localmente em 2026-10-06; na `dev`, ainda fora
da produção.
Origem: pedidos do usuário em 2026-10-06, depois das specs
[075](075-position-page-cleanup-and-month-strip.md) e
[076](076-position-liquidation.md).

## Pedidos

1. Dentro de uma posição, a faixa de competências mostra só os meses em que ela
   existe, sem chance de entrar num mês sem a posição. Ela muda conforme o
   contexto, como a "Sweep" (a ilha antiga do topo).
2. **A trilha repetia "Posições › ativo".**
   - Tirar o "Posições" repetido.
   - Ligar por setas a aba Posições à posição e a posição à faixa de
     competências.
   - Fora de uma posição, o comportamento continua o atual.
3. **A busca de Posições ficava espremida no celular:** o campo grande, ao lado
   de muitos filtros, ficava confuso. Deixar mais visual.
4. No celular, o arraste lateral trocava entre Visão geral e Posições sem querer.
   A troca de aba deve acontecer só pelo toque na aba.

## Decisões

### Faixa de competências e trilha

- **Meses da posição:** a faixa já recebia só os meses da posição desde a
  [spec 075](075-position-page-cleanup-and-month-strip.md), com redirecionamento
  de um mês sem ela.
- **Faixa restrita (`scoped`):**
  - a cápsula do ano aberto ganha a borda da cor do projeto;
  - os meses entram com uma animação curta, só na primeira montagem;
  - a navegação marca `data-scoped`.
- **Trilha:** só o ícone e o nome ("Porquinho", "Cotações · Set/26"), com a
  borda da cor do projeto.
- **Setas** (`TrailConnectors`, em `main-tabs.tsx`): um SVG sobre o topo
  inteiro.
  - Uma curva sai da borda de baixo da barra de abas, sob a aba Posições, até a
    trilha.
  - Numa posição, outra vai da trilha até a faixa, com a ponta de seta.
  - Nas Cotações, a faixa é a de sempre: só a primeira seta.
  - As posições vêm do layout (`getBoundingClientRect`) e são recalculadas com
    `ResizeObserver`, ao redimensionar e depois da entrada animada.
  - As linhas se desenham com `pathLength`, sem animação para quem reduz
    movimento.

### Filtros de Posições no celular

- **Abaixo de `sm`:**
  - **Classes:** os atalhos rolam numa linha só.
  - **Busca e Filtros:** a busca ("Buscar posição") divide a linha com o botão
    Filtros, que mostra quantos filtros estão ativos.
  - **Folha:** Filtros abre uma folha de baixo para cima (Base UI Drawer, que
    fecha ao arrastar para baixo). Nela ficam o agrupamento e cada filtro em
    chips de toque, mais "Limpar" e "Ver N posições".
- **No computador (`sm` em diante):** as listas, "Limpar filtros" e "Agrupar"
  continuam na própria linha.
- **Mesmos filtros nas duas versões:** as opções em cascata são as mesmas e os
  parâmetros da URL não mudam.

### Abas sem arraste

- **`TabViewport`:** sem os eventos de toque da
  [spec 062](062-iphone-mobile-review.md); só a entrada suave da página.
- **Arraste lateral:** em telas de toque, `overscroll-behavior-x: none` em
  `html` e `body` evita que ele navegue no histórico do navegador.
  - O gesto de voltar da borda do Safari é do sistema e continua.

## Verificação

Em 2026-10-06, no `pnpm dev` do usuário (porta 3000), com o backup v3:

- `pnpm check` passou.
- **`nav-trail.spec.ts`:**
  - a trilha sem "Posições";
  - três traços numa posição (duas curvas e a ponta) e um nas Cotações;
  - `data-scoped` só na faixa da posição.
- **`positions-cascading-filters.spec.ts`:**
  - os testes de cascata abrem a folha quando as listas estão ocultas;
  - um cenário novo do celular confere busca e Filtros na mesma linha, a folha
    com Moeda e Agrupar, e o botão com "1 ativo".
  - O alinhamento é medido numa leitura só: medido em duas, a página ainda
    deslizava na entrada e dava 4 px de diferença no WebKit.
- **`iphone-mobile-review.spec.ts`:** os três cenários de arraste viraram um.
  Arrastar para os dois lados não troca a aba; o toque na aba troca.
- **Suíte e2e completa** (Chrome, Android e Safari do iPhone): 246 aprovados e
  109 pulados por falta de mês aberto. As 6 falhas eram três testes de celular
  que abriam as listas de filtro do computador:
  - `home`, `types-and-dates` e `positions-cascading-filters` passaram a usar
    `tests/e2e/support/position-filters.ts`, que escolhe entre listas e folha;
  - o teste das listas com busca, em `styled-pickers`, ficou só no computador;
  - depois disso, os quatro arquivos passaram nos três perfis: 58 aprovados.
- **Capturas:**
  - o topo no computador e no celular (Porquinho), e o das Cotações;
  - Posições no celular antes e depois;
  - a folha de filtros.

## Arquivos

- `src/components/product/main-tabs.tsx`, `month-timeline.tsx`,
  `app-shell.tsx`, `tab-viewport.tsx`
- `src/app/globals.css`
- `src/modules/portfolio/ui/positions-filter-sheet.tsx`,
  `positions-workspace.tsx`
- `tests/e2e/nav-trail.spec.ts`, `positions-cascading-filters.spec.ts`,
  `iphone-mobile-review.spec.ts`, `home.spec.ts`, `types-and-dates.spec.ts`,
  `styled-pickers.spec.ts`, `support/position-filters.ts`
