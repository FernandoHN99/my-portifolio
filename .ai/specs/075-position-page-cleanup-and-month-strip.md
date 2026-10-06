# 075 — Página da posição mais limpa, sem textos explicativos e com os meses da posição

Estado: implementada e validada localmente em 2026-10-05; na `dev`, ainda fora
da produção.
Origem: pedidos do usuário em 2026-10-05, depois de ver a página da
[spec 073](073-position-page-applied-value-and-nav-trail.md) no app.

## Pedidos

1. Mês a mês e Movimentações com uma seta de expansão, começando recolhidos.
2. Destaques sem quadro próprio: algo clicável e discreto dentro do card
   "Variação no mês", com o melhor e o pior mês.
3. Variação mensal do saldo com os períodos 6M, 12M, YTD e Tudo, lado a lado com
   "De onde veio a variação". A cotação continua sozinha na largura.
4. Tirar a conta corrente clicável do formulário: ela não funcionava e não era
   usada.
5. Tirar todos os textos explicativos e descrições auxiliares dos componentes.
6. Na página de uma posição, a faixa de competências mostra só os meses com
   dados daquela posição. O resto do comportamento da faixa não muda.

## Decisões

### Página da posição

- **Ordem:**
  1. os cinco cards;
  2. a evolução;
  3. a cotação, na largura toda;
  4. a variação mensal e a decomposição lado a lado (a partir de `xl`; abaixo,
     uma sobre a outra);
  5. o rateio, quando há mais de uma classe;
  6. o mês a mês e as movimentações, recolhidos.
- **Recolhidos:** `CollapsibleSection` (Base UI Collapsible). O título fica num
  `h2` com o botão, e o resumo continua visível fechado ("41 competências",
  "4 registros").
  - Fechado, o conteúdo sai da página. O `hidden="until-found"` foi descartado:
    no Safari do iPhone o conteúdo continuava à vista.
- **Destaques:** o quadro saiu.
  - O card "Variação no mês" ganhou o botão "Melhor e pior mês", que abre um
    popover com os dois meses; cada um abre a competência.
  - O preço médio foi para o card "Valor aplicado", como "Preço médio R$ X". A
    origem do custo fica no título do elemento (por exemplo, "Preço médio com
    saldo inicial").
  - Nos saldos sem cotação, o card mostra desde quando a posição existe.
- **Variação mensal:** os períodos terminam na competência selecionada, e o
  padrão é 12M. "Tudo" mostra o histórico inteiro. O grupo de botões se chama
  "Período da variação mensal", para não se confundir com o do gráfico de
  cotação.
- **De onde veio a variação:** o quadro usa consulta de contêiner (`@3xl`) para
  pôr o gráfico e os valores lado a lado só quando há espaço; na metade da tela,
  um fica sobre o outro.

### Textos explicativos

- **Saíram** as descrições abaixo dos títulos e as notas de rodapé:
  - na página da posição: evolução, cotação, variação mensal, decomposição,
    rateio, movimentações, quadro do CDI e a frase das outras contas, que virou
    "Também em …" com os links;
  - na Visão geral: o subtítulo, a evolução, comprar e vender, renda fixa por
    resgate, os donuts e o tipo de ativo;
  - nas Cotações: o subtítulo;
  - na Configuração: as descrições das metas, das versões, da prévia e da
    tolerância, e o texto do backup. O subtítulo ficou só com a data da última
    alteração.
  - Em Posições, a contagem perdeu o "separadas por instituição".
- **Ficaram:** avisos de estado e de erro (histórico de cotações pendente, mês
  fechado, posição ausente), mensagens de vazio curtas, as confirmações dos
  diálogos e as instruções das etapas dos formulários guiados
  ([spec 066](066-guided-position-and-movement-dialogs.md)), que são do fluxo e
  não descrições de componentes.

### Conta corrente

- O formulário da posição não mostra mais a opção "Conta corrente" nem a manda
  ao servidor.
- O campo `cash_account` continua no banco e no backup, sem uso na interface.
  A liquidação deixou de usá-lo ([spec 076](076-position-liquidation.md)).

### Faixa de competências na página da posição

- A página passa ao `AppShell` só as competências em que a posição existe no
  recorte escolhido: nesta conta, ou em todas as contas com `contas=todas`.
- O recorte passou a recarregar no servidor (`shallow: false`), para a faixa
  acompanhar.
- Um endereço com um mês sem a posição redireciona para o último mês com ela
  até ali, ou para o primeiro, mantendo os outros parâmetros. Isso inclui o mês
  corrente, quando a posição já foi liquidada.

## Verificação

Em 2026-10-05, com o backup v3 restaurado na carteira local
([spec 076](076-position-liquidation.md)):

- `pnpm check` e 36 testes unitários passaram.
- `position-history.spec.ts`, nos três perfis (Chrome, Android e Safari do
  iPhone), 28 aprovados:
  - preço médio no card do valor aplicado;
  - melhor e pior mês no popover;
  - mês a mês e movimentações começando recolhidos;
  - os períodos da variação mensal;
  - ausência dos textos explicativos;
  - a faixa sem os anos em que a posição não existe;
  - o redirecionamento de um mês sem a posição.
- `position-form.spec.ts`: a opção de conta corrente não aparece mais. O cenário
  só roda com um mês aberto.
- Capturas de desktop (Bitcoin 01, Bitcoin 02 liquidado em mar/2024, tabela de
  out/2026) e do celular (Porquinho, 390 px).
- Suíte e2e completa num servidor de teste separado (Chrome, Android e Safari do
  iPhone): 249 aprovados e 110 pulados por falta de mês aberto.
  - As 5 falhas eram de dois testes da Configuração que ainda esperavam textos
    retirados.
  - Um deles procurava o mês da prévia, que voltou como dado ao lado do título,
    sem a frase.
  - Depois do ajuste, `home`, `target-settings-adjustments` e
    `settings-horizontal-overflow` passaram nos três perfis: 52 aprovados.

## Arquivos

- `src/modules/portfolio/ui/position-detail.tsx`, `collapsible-section.tsx`,
  `position-highlights.tsx`, `kpi-card.tsx`, `balance-change-chart.tsx`,
  `position-attribution.tsx`, `position-months-table.tsx`,
  `position-transactions.tsx`, `position-allocation.tsx`, `cdi-panel.tsx`,
  `position-form-dialog.tsx`
- `src/app/posicoes/[accountId]/[assetId]/page.tsx`
- Textos: `overview-dashboard.tsx`, `rebalance-panel.tsx`,
  `fixed-income-duration-chart.tsx`, `composition-donuts.tsx`,
  `asset-type-breakdown.tsx`, `target-editor.tsx`,
  `src/modules/quotes/ui/quotes-workspace.tsx`,
  `src/modules/backup/ui/backup-panel.tsx`
