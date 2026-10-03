# 038 — Gráficos para daltonismo, sem contorno ao clicar, e card da atualização só no mês corrente

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedidos do usuário em 2026-10-03 (quarta rodada), registrados em
[Reestruturação da UX](../context/ux-restructure.md):

- "Eu sou daltônico, deixe cores para os gráficos bem diferentes para mim";
- ao clicar num gráfico, a fatia ou a área ficava com um contorno; deve ficar
  invisível em todos os gráficos;
- o card "Última atualização" da página de cotações só precisa aparecer no
  mês corrente;
- "Atualizado há" no topo está ótimo e fica como está.

## Comportamento

- **Paleta**: as categorias usam a paleta Okabe-Ito, desenhada para ser
  distinguível com qualquer tipo de daltonismo
  (`src/modules/portfolio/presentation/category-colors.ts`). Classes: Caixa
  azul-claro, Cripto laranja, Renda Fixa verde-azulado, Renda Variável amarelo,
  Reserva roxo. Moedas: BRL verde-azulado, USD azul-claro, BTC laranja,
  Altcoins roxo, EUR amarelo. Estratégias: Core azul-claro, Core-Satellite
  laranja, Hedge cinza, Satellite amarelo. Resgate: Curto azul-claro, Médio
  laranja, Longo cinza;
- **Alta e queda**: nos gráficos e nas marcas da linha do tempo, azul
  (`--chart-up`) e laranja (`--chart-down`) no lugar de verde e vermelho, o par
  mais difícil para daltonismo. Aportes e resgates, na página da posição,
  ficam em roxo;
- **Contorno**: nenhum elemento dos gráficos mostra contorno de foco ao clicar
  (regra `.recharts-wrapper :focus` em `globals.css`);
- **Card da atualização**: só no mês corrente; nos outros meses a página de
  cotações não mostra o card.

## Fora do escopo

Os textos de variação com sinal (+ e −) continuam em verde e vermelho nos
indicadores; o sinal e a seta já distinguem alta de queda.

## Verificação

- navegador: as fatias dos donuts usam as cores novas (Cripto #e69f00, Renda
  Fixa #009e73, Caixa #56b4e9, Renda Variável #f0e442, Reserva #cc79a7);
- testes: o card não aparece em Set/26 e o topo continua sem seta fora do mês
  corrente;
- `pnpm check`, `pnpm build` e a suíte do Playwright.

## Referências

- [Visão Geral](011-overview-tab.md)
- [Página de cotações em Posições](022-quotes-page.md)
