# 078 — Alocação por abas na Visão geral, virada com confirmação e gráficos de toque

Estado: implementada e validada localmente em 2026-10-06; na `dev`, ainda fora
da produção.
Origem: pedidos do usuário em 2026-10-06.

## Pedidos

1. **Liquidação que não aparecia:** o CDB - 110% mostrava só o saldo inicial.
   Toda posição que some deve ter a liquidação, pelo último valor registrado.
2. Ao virar o mês, perguntar antes de criar a competência, em vez de criar
   sozinho.
3. No backup, os ícones de exportar e importar estavam trocados.
4. **Visão geral:**
   - os gráficos de classe, moeda e estratégia aparecem só na aba deles;
   - Caixa e Renda Variável ganham gráfico, e a Renda Fixa usa o de resgate;
   - as abas saem de comprar e vender, e comprar e vender acompanha a aba;
   - evolução do patrimônio e tipo de ativo ficam sempre à vista.
5. No gráfico de evolução da posição, clicar num mês não deve levar ao mês.
6. No celular, a indicação dos gráficos aparece com o dedo e some quando ele
   sai.
7. A seta de recolher do mês a mês e das movimentações fica à esquerda.
8. Tirar as setas do topo (aba → posição → meses), mantendo o resto.
9. **Depois de ver a primeira versão:**
   - trocar as roscas por barras, no modelo da renda fixa por resgate;
   - pôr a aba e as subabas uma embaixo da outra, com um visual mais claro;
   - a aba principal, na largura toda, ficou grande e desproporcional: deixar
     menor.

## Decisões

### Liquidação na posição

- **Os dados estavam certos.** A conta do usuário, importada com a v3, tem o
  CDB - 110% com saldo inicial, rendimento e a retirada total em 01/10/2023,
  pelo último saldo.
- **A tela escondia a liquidação:**
  - as movimentações listavam só até o mês selecionado, e o usuário abriu a
    posição num mês anterior à saída;
  - agora a lista mostra todas as movimentações da posição, e a liquidação
    aparece como a última em qualquer mês;
  - o selo "Liquidada em …" já levava ao mês da saída
    ([spec 076](076-position-liquidation.md)).
- **Regra do usuário:** era a mesma da v3, sem mudança. Toda posição que some
  termina com uma retirada total pelo último valor registrado.

### Virada de mês com confirmação

- **Checagem de abertura:** `checkMonthsUpToDate` diz quais competências faltam
  (`state: "pending"`) sem gravar.
  - Um usuário sem competência continua recebendo a primeira na hora
    ([spec 055](055-empty-portfolio-start.md)).
- **Confirmação:** o topo (`MonthRolloverPrompt`, no indicador de cotações)
  pergunta "Começar novembro de 2026?".
  - Diz que as posições e os rateios passam para o mês novo e que o anterior
    fica fechado.
  - Com vários meses, lista todos.
- **"Criar"** chama `confirmMonthRolloverAction`, que faz a virada de sempre
  (`ensureMonthsUpToDate`) e mostra o aviso de competências criadas.
- **"Agora não"** guarda o mês na sessão do navegador e não pergunta de novo até
  outra sessão. O botão "Criar … a partir de …", em Posições, continua
  disponível.

### Visão geral

- **Sempre à vista:** os indicadores, a evolução do patrimônio e o tipo de
  ativo.
- **Bloco "Alocação"** (`AllocationExplorer`):
  - as abas Geral, Caixa, Renda Fixa e Renda Variável e, no Geral, a divisão
    Classe, Moeda e Estratégia ficam fora de comprar e vender;
  - os mesmos parâmetros de antes (`corte`, `sub`) escolhem o gráfico de cima e
    as linhas de comprar e vender de baixo.
- **Abas** (depois do retorno do usuário):
  - o recorte fica numa barra do tamanho do conteúdo;
  - a divisão (Classe, Moeda, Estratégia; ou a única do recorte) fica logo
    abaixo, menor;
  - o destaque desliza entre as opções.
  - A primeira versão, com a aba principal na largura toda, ficou
    desproporcional e foi descartada.
- **Gráfico de cada aba** (`AllocationBars`, no modelo da renda fixa por
  resgate): uma barra por item, o atual e o ideal lado a lado na mesma escala,
  com o percentual sobre cada barra. As roscas da primeira versão saíram.
  - Geral: Classe de ativos, Moeda e Estratégia;
  - Caixa: "Caixa por moeda";
  - Renda Variável: "Renda variável por subclasse";
  - Renda Fixa: o "Renda fixa por resgate", agora na largura toda, com atual e
    ideal lado a lado a partir de 1024 px.
- **Código:**
  - `AllocationBars` substituiu `CompositionDonuts` e recebe as linhas do
    recorte;
  - as subclasses da renda variável ganharam cores próprias em
    `category-colors.ts`, porque se repetiam;
  - `RebalancePanel` virou só a tabela;
  - a composição separada saiu de `getOverviewData`.

### Gráficos

- **Sem troca de mês no clique:** a evolução e a variação mensal da posição não
  trocam mais de mês. O mês muda pela faixa e pelo mês a mês.
- **Evolução do patrimônio:** o clique continua abrindo a competência no mouse.
  No toque, tocar só mostra a indicação.
- **Toque (`useTouchTooltip`):** a indicação aparece com o dedo e some ao tirar.
  - O Recharts só limpa a indicação quando o ponteiro deixa o gráfico. No fim
    do toque, o gráfico recebe essa saída, repetida depois dos eventos de mouse
    que o navegador emula.
  - Vale para a evolução do patrimônio, as barras da alocação, a renda fixa, a
    cotação, a evolução e a variação mensal da posição e a decomposição.

### Outros

- **Recolher:** a seta fica à esquerda do título, girando para baixo ao abrir,
  como nas linhas da tabela de Posições.
- **Topo:** as setas da [spec 077](077-header-trail-and-mobile-filters.md)
  saíram. Ficaram a trilha só com o nome e a faixa restrita aos meses da
  posição.
- **Backup:** exportar usa a seta para fora e importar, a seta para dentro.

## Verificação

Em 2026-10-06, no `pnpm dev` do usuário:

- **Checks:** `pnpm check` passou.
- **`month-rollover.spec.ts`:**
  - a pergunta com um mês e com dois;
  - "Agora não" fecha sem aviso e não pergunta de novo ao recarregar.
- **`home.spec.ts`:**
  - as abas trocam o gráfico e o comprar e vender juntos;
  - renda fixa com o gráfico de resgate e as linhas IPCA;
  - Caixa e Renda Variável com os gráficos próprios;
  - evolução e tipo de ativo à vista.
- **`overview-adjustments.spec.ts`:** os cenários da renda fixa abrem a aba
  dela. Atual e ideal ficam lado a lado no computador e um sobre o outro no
  celular.
- **`position-history.spec.ts`:**
  - clicar na evolução e na variação mensal não troca de mês;
  - no toque, a indicação aparece com o dedo e some ao tirar (Chrome do Android
    e Safari do iPhone);
  - a liquidação aparece nas movimentações.
- **`nav-trail.spec.ts`:** sem as setas, com a faixa restrita na posição.
- **Resultado:** os cinco arquivos passaram nos três perfis, com 108 aprovados.
- **Suíte completa:** 262 aprovados e 112 pulados.
  - As 2 falhas foram tempos esgotados no Safari do iPhone, com a suíte
    carregando o servidor: a largura das telas e o seletor da posição.
  - Repetidos depois das barras e das abas novas, junto com `home`,
    `overview-adjustments`, `position-history` e `month-rollover`, passaram:
    114 aprovados.
- **Capturas:**
  - a Visão geral nas abas Geral, Renda Fixa e Renda Variável;
  - a pergunta da virada;
  - o backup;
  - o topo e os recolhíveis da posição.

## Arquivos

- `src/modules/portfolio/ui/allocation-explorer.tsx`, `allocation-bars.tsx`,
  `rebalance-panel.tsx`, `fixed-income-duration-chart.tsx`,
  `overview-dashboard.tsx`, `use-touch-tooltip.ts` e os gráficos
  (`portfolio-evolution-chart.tsx`, `asset-price-chart.tsx`,
  `position-evolution-chart.tsx`, `balance-change-chart.tsx`,
  `position-attribution.tsx`); `src/modules/portfolio/presentation/category-colors.ts`
- `src/modules/portfolio/application/month-rollover.ts`, `open-checks.ts`,
  `get-overview-data.ts`; `src/modules/portfolio/domain/month-rollover.ts`
- `src/components/product/month-rollover-prompt.tsx`,
  `quote-refresh-client.ts`, `quote-refresh-indicator.tsx`, `main-tabs.tsx`
- `src/app/actions/edit-month.ts`
- `src/modules/portfolio/ui/collapsible-section.tsx`, `position-detail.tsx`
- `src/modules/backup/ui/backup-panel.tsx`
