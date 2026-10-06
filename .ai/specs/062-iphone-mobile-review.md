# 062 — Revisão mobile com referência no Safari do iPhone 16 Plus

Estado: emulação concluída localmente em 2026-10-04; falta a conferência no iPhone físico. Sem deploy.
Em 2026-10-06, o arraste para trocar de aba saiu a pedido do usuário: as abas só
trocam pelo toque ([spec 077](077-header-trail-and-mobile-filters.md)).
Origem: briefing dos próximos ajustes e confirmação do aparelho/navegador pelo usuário.

## Objetivo

Revisar as telas existentes e os novos fluxos financeiros no celular, preservando
a leitura e a facilidade de preenchimento. A referência é Safari no iPhone 16 Plus.
O controle descrito como "swipe espremido" não foi localizado pelo usuário:
verificar deslizantes de metas, faixa de competências e gesto de trocar abas.

## Escopo

- Navegação por gesto sem disputar campos, controles ou tabelas com rolagem horizontal;
- trilho das metas com largura útil no celular, e campos de 16 px para evitar o zoom de foco do Safari;
- viewport dinâmica, áreas seguras e tema escuro do navegador, mantendo zoom acessível;
- faixa de competências com alvos de toque maiores;
- perfil iPhone 16 Plus/WebKit no Playwright e revisão de entrada/cadastro, Visão Geral,
  Posições, detalhe, cotações, Configuração/backup e formulários, sem salvar dados financeiros;
- registrar evidência observada e limitações, inclusive teclado e gestos no aparelho real.

## Critérios de aceite

- Um arraste de tabela ou iniciado em campo/controle não troca a aba;
- swipe no conteúdo livre ainda permite trocar entre Visão Geral e Posições;
- deslizantes de metas ocupam sua própria linha no celular, sem estreitar o trilho entre rótulo e campo;
- campos visíveis usam pelo menos 16 px no toque, e viewport não proíbe zoom;
- telas e diálogos revisados cabem nas larguras de retrato/paisagem e mantêm ações acessíveis;
- conteúdo respeita as áreas seguras do iPhone;
- testes simulam checagem de abertura com `stubQuoteChecks`, não salvam carteira e rodam no servidor local isolado;
- emulação e confirmação no iPhone físico são descritas separadamente.

## Verificação

### Em emulação (2026-10-04)

- perfil `mobile-safari` no Playwright: iPhone 16 Plus, WebKit 26 (pacote
  `webkit-2359`), ao lado de desktop-chrome e mobile-chrome (Pixel 7). A suíte
  completa passou nos três perfis sobre os dados locais, sem gravar carteira;
- `tests/e2e/iphone-mobile-review.spec.ts` (outra frente): viewport com áreas
  seguras e zoom disponível, largura sem rolagem lateral, campos de 16 px e o
  gesto de abas que não dispara a partir de campos, controles e tabelas com
  rolagem horizontal;
- achados do WebKit e correções:
  - no seletor (`src/components/ui/picker.tsx`), tocar de novo num campo já
    preenchido não selecionava o texto, e o que se digitava era somado ao valor
    ("Inter" + "itau"). O primeiro soltar depois do foco agora preserva a
    seleção;
  - campos preenchidos antes da hidratação, mais lenta no WebKit, mostravam o
    texto sem o React receber a mudança. Os testes que preenchem esperam a
    hidratação (`waitForHydration`, em `tests/e2e/support/position-form.ts`);
  - o recarregamento de dados depois da checagem conta como navegação no
    WebKit; os testes que trocam de página esperam a rede assentar;
- os formulários novos (movimentação, liquidação, CDI e Tesouro) passaram nos
  três perfis.

### Depende do iPhone físico

Teclado virtual do Safari sobre os diálogos, áreas seguras reais (ilha e barra
inferior), rolagem com borracha, sensação do gesto entre abas e dos
deslizantes das metas, e o seletor de data nativo. Os testes WebKit não
reproduzem a física do toque nem o teclado do iOS.

## Referências

- [Descoberta dos próximos ajustes](../context/next-adjustments-discovery.md)
- [Metas derivadas](054-derived-currency-and-single-target-plan.md)
- [Primeiro uso](055-empty-portfolio-start.md)
