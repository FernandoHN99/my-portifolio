# 024 — Visão Geral: duração em dois gráficos, variação no período e hover nos cards

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

## Problema

Pedidos do usuário em 2026-10-02, registrados em
[Reestruturação da UX](../context/ux-restructure.md), em "Ajustes pedidos em
2026-10-02, antes da previdência":

- "Renda fixa por duração: Deixar como no print um em cima e uma em baixo
  ficou estranho do jeito atual!";
- "Remover card de itens FORA DA META e aparecer o Variação em todo
  periodo.";
- "deixar todo os cards com o comportamento de hover que tem no Patrimônio
  total, Variação no mês e etc".

Fatos observados no código antes da mudança:

- o gráfico de renda fixa por duração tinha a duração no eixo horizontal e
  misturava, no mesmo gráfico, séries atuais e ideais por subclasse;
- o gráfico era montado com as linhas do recorte de rebalanceamento, que só
  existem para combinações com posição atual; em março de 2024, por exemplo,
  só havia Pós-fixado Curto, e o ideal perderia cinco das seis metas;
- o card "Fora da meta" contava os itens de comprar ou vender e levava ao
  painel de rebalanceamento;
- só os cards de indicador (`.metric-card`) tinham hover; os painéis
  (`.premium-panel`) não reagiam ao ponteiro.

A captura da planilha mostra dois gráficos de colunas empilhados:
"Renda Fixa x Duration" em cima e "Renda Fixa Ideal x Duration" embaixo, com
as subclasses no eixo horizontal, três barras por subclasse (Curto azul,
Médio laranja, Longo cinza), cada barra com o percentual e a legenda
Curto, Médio e Longo.

## Objetivo

Reproduzir a leitura da planilha para a renda fixa por duração, trocar o
indicador de itens fora da meta pela variação do patrimônio em todo o
histórico e dar a todos os cards a mesma resposta ao ponteiro.

## Comportamento

### Renda fixa por duração

- um único card com dois gráficos de colunas: "Atual" em cima e "Ideal"
  embaixo, separados por uma linha;
- no eixo horizontal ficam as subclasses; em cada subclasse, as barras
  agrupadas Curto, Médio e Longo, nas cores da planilha;
- cada barra mostra o seu percentual no mesmo formato do tooltip e da
  tabela, com uma casa decimal; quando a barra é estreita demais para esse
  formato, todos os rótulos dos dois gráficos passam a percentual inteiro,
  em 10 px ou, em barras muito estreitas, em 9 px; só um rótulo que ainda
  não cabe sem invadir o vizinho é omitido, e o valor continua no tooltip e
  na tabela acessível;
- o tooltip de cada subclasse traz atual e ideal de cada prazo;
- os percentuais são sobre o total de renda fixa: no atual, as células somam
  100% do total atual da classe; no ideal, são as metas do grupo de renda
  fixa, que somam 100% do ideal da classe;
- os dois gráficos usam a mesma escala vertical, as mesmas subclasses e as
  mesmas séries de prazo, de modo que cada subclasse e prazo ocupa a mesma
  posição e a mesma largura no atual e no ideal;
- uma legenda única acima dos gráficos e uma tabela acessível, oculta na
  tela, com subclasse, prazo, atual e ideal;
- sem renda fixa na competência, o gráfico atual mostra "Sem renda fixa
  nesta competência"; sem metas, o ideal mostra "Sem metas de renda fixa";
  sem nenhum dos dois, o card não aparece.

### Variação em todo o período

- o quarto card de indicador passa a ser "Variação em todo o período", no
  mesmo padrão de "Variação no mês" e "Variação em 12 meses": percentual em
  destaque, valor em reais embaixo, seta e cor pelo sinal;
- compara o patrimônio da competência selecionada com o da primeira
  competência do histórico, informada no texto, por exemplo
  "R$ 210.311,72 desde Jun/23";
- na primeira competência mostra "—" e "Primeira competência do histórico".

### Hover nos cards

- painéis e cards de indicador recebem a mesma resposta: borda na cor
  primária e fundo um passo mais claro, com transição de 160 ms;
- os cards de indicador continuam subindo 1 px; os painéis não se movem;
- o hover só existe em dispositivos com ponteiro (`hover: hover`); com
  movimento reduzido, os cards não sobem.

## Decisões tomadas

- "um em cima e uma em baixo" foi entendido como os dois gráficos da
  captura no mesmo card, atual em cima e ideal embaixo, e não como dois
  cards separados;
- a matriz de subclasse por prazo é calculada no servidor por
  `buildFixedIncomeDuration`, em `domain/fixed-income-duration.ts`, a partir
  dos totais de renda fixa e das metas vigentes; o ideal vem das metas e não
  das linhas de rebalanceamento, para não perder metas sem posição;
- a escala vertical vai até o maior valor dos dois gráficos com 10% de
  folga, arredondada em passos de 10, 20 ou 25 pontos e limitada a 100%;
- as subclasses do plano aparecem primeiro, em ordem alfabética, e depois as
  que só existem no atual;
- prazos fora de Curto, Médio e Longo que existem nos dados não foram
  reclassificados: aparecem como série própria nos dois gráficos, mesmo
  vazia num deles, e "-" aparece como "Sem prazo". Nos dados importados há
  Pós-fixado D+0 em oito competências entre junho de 2023 e novembro de
  2024, Pós-fixado D+1 em julho de 2025 e BTC sem prazo classificado como
  renda fixa de outubro a dezembro de 2025;
- correção feita na revisão: na primeira versão, a série fora do padrão só
  entrava no gráfico em que ocorria, e em 12 das 31 competências o atual
  tinha quatro posições por subclasse e o ideal três, com a mesma subclasse
  e prazo em posição e largura diferentes. Agora as duas séries são a união
  dos prazos. Juntar os prazos fora do padrão numa série "Outros" foi
  descartado, porque também ocuparia uma quarta posição e esconderia a
  diferença entre D+0, D+1 e sem prazo. Pelo mesmo motivo, uma subclasse que
  só existe no atual, como o BTC, deixa uma categoria vazia no ideal;
- rótulos das barras, decididos na revisão: a precisão e o tamanho dependem
  só da largura das barras, que é a mesma nos dois gráficos, para que todos
  os rótulos tenham o mesmo formato; a medida usa o avanço de 0,6 em da
  Geist Mono e exige 2 px entre rótulos vizinhos de altura parecida. Ao lado
  de um vizinho bem mais alto, o rótulo pode ocupar o vão até a barra dele.
  O espaço entre subclasses caiu de 16% para 6% da categoria, o que só muda
  telas estreitas, porque nas largas as barras já estão no limite de 32 px;
- as cores de Curto (#6ea8ff), Médio (#f2a65a) e Longo (#9aa4b2) ficam no
  mapa de cores por categoria, de modo que os pontos das linhas de renda fixa
  na tabela de comprar e vender usam as mesmas cores do gráfico; prazos fora
  do padrão usam a cor de reserva já existente para rótulos desconhecidos;
- a paleta foi conferida com o validador de cores da skill de visualização:
  passa em separação para daltonismo, distinção normal e contraste com o
  fundo escuro, e fica fora das faixas de luminosidade e saturação que a
  skill usa como referência, assim como o restante da paleta do app; as três
  cores foram mantidas por serem as da planilha e do app, e toda barra tem
  rótulo ou tooltip além da cor;
- a variação em todo o período é variação de patrimônio, com aportes, como
  os outros cards de variação, e não rentabilidade;
- o campo `offTargetCount` saiu dos dados da Visão Geral; `countOffTarget`
  continua no domínio porque a prévia da configuração ainda mostra "Fora da
  meta"; `offTargetTolerance` continua porque o painel de comprar e vender
  explica a faixa de tolerância;
- o hover é central, em `globals.css`, sobre `.premium-panel` e
  `.metric-card`, para alcançar todos os cards sem editar os componentes de
  outras fatias; avisos, barras de edição, diálogos, toasts, menus e
  etiquetas não são cards e ficaram sem hover;
- os painéis não sobem porque deslocar uma seção inteira, como a tabela de
  posições, parece a página tremendo. Fato técnico, corrigido na revisão:
  `.premium-panel` já mantém `transform: translateY(0)` pelo preenchimento
  `both` da animação de entrada `surface-enter`, então um `transform` no
  hover do painel seria sobreposto pela animação e não teria efeito. Fazer
  os painéis subirem exigiria antes remover ou trocar esse preenchimento;
- correção encontrada durante a verificação: no celular, a tabela de comprar
  e vender, com largura mínima de 640 px, alargava a grade da Visão Geral e
  a página inteira passava a ter 702 px num aparelho de 412 px. A grade
  ganhou `grid-cols-1`, e a tabela rola dentro do próprio painel.

## Fora do escopo

- mudar a regra das linhas de comprar e vender para incluir metas sem
  posição;
- reclassificar D+0, D+1 ou o BTC registrado como renda fixa;
- o cálculo de "Variação no mês" e "Variação em 12 meses";
- o excesso de 10 px de largura observado na configuração no celular, dentro
  do editor de metas, que pertence a outra fatia;
- Previdência.

## Questões em aberto

Respondidas pelo usuário em 2026-10-02 e implementadas na
[spec 030](030-overview-calendar-comparisons.md): variações por meses do
calendário, início de "todo o período" em Out/23 e meta sem posição como
"Comprar". Os prazos D+0 e D+1 e o BTC em renda fixa ficam para o
[passo pré-produção](../context/pre-deploy.md): o usuário não quer alterar
dados antigos agora.

## Critérios de aceite

- o card de renda fixa por duração mostra o atual em cima e o ideal
  embaixo, com subclasses no eixo horizontal e barras Curto, Médio e Longo
  rotuladas;
- os dois gráficos têm a mesma escala, as mesmas subclasses e os mesmos
  prazos, com cada barra na mesma posição horizontal; cada lado soma 100%;
- num celular de 360 px, toda barra de setembro de 2026 tem rótulo;
- não existe card "Fora da meta" na Visão Geral; "Variação em todo o
  período" mostra percentual e valor em reais;
- painéis e cards de indicador respondem ao ponteiro da mesma forma; não há
  hover em telas de toque nem deslocamento com movimento reduzido;
- a Visão Geral não ultrapassa a largura do celular;
- lint, tipos, build e testes de interface passam.

## Verificação

Num banco local criado pelas migrações e carregado com a importação do
Excel, setembro de 2026 mostrou renda fixa de R$ 48.529,09 dividida em IPCA
6,3% curto, 10,5% médio e 25,5% longo e Pós-fixado 21,3% curto, 25,6% médio e
10,7% longo, contra o ideal de 10%, 15%, 15%, 30%, 25% e 5%, ambos na escala
de 0 a 40%. Maio de 2024 mostrou o aviso de competência sem renda fixa.
"Variação em todo o período" mostrou +502,11% e "R$ 210.311,72 desde
Jun/23", conferidos contra os totais de junho de 2023 (R$ 41.885,20) e
setembro de 2026 no banco; junho de 2023 mostrou "—".

Na revisão, as séries e os rótulos foram medidos no navegador, no desktop e
nas larguras de 320, 360, 375, 390 e 412 px, em setembro de 2026, julho de
2025 (D+1), outubro a dezembro de 2025 (BTC sem prazo), junho de 2023 (D+0)
e março de 2024:

- os dois gráficos têm sempre o mesmo número de séries, e a mesma
  subclasse e prazo tem a mesma posição horizontal no atual e no ideal;
- setembro de 2026 mostra os 12 rótulos em todas as larguras: com uma casa
  decimal no desktop e de 360 px para cima, inteiros em 320 px;
- julho de 2025, junho de 2023 e março de 2024 mostram todos os rótulos
  nas larguras medidas;
- de outubro a dezembro de 2025, com três subclasses e quatro prazos, todos
  os rótulos aparecem do desktop até 375 px; em 360 e 320 px o ideal mostra
  só "5%", e os demais valores ficam no tooltip e na tabela acessível. Essa
  limitação vem do BTC registrado como renda fixa, listado nas questões em
  aberto.

As capturas de tela do card foram revisadas no desktop, no Pixel 7 e em 360
e 320 px. Na primeira versão também foram revisadas Visão Geral, Posições e
Configuração no desktop e no Pixel 7. No desktop, os estilos calculados
confirmaram borda e fundo no hover dos painéis, com o painel na mesma
posição, e a subida de 1 px nos cards de indicador; o `transform` calculado
dos painéis é a identidade, mantida pela animação de entrada, com ou sem
hover. No perfil de celular, `(hover: hover)` é falso e nada muda. Antes da
correção da grade, a Visão Geral no celular tinha 702 px de largura; depois,
412 px.

O arquivo `tests/e2e/overview-adjustments.spec.ts` não grava nada. Confere:

- o card de variação no período, com sinal, cor e o texto
  "R$ … desde Jun/23", e a primeira competência;
- que a Visão Geral não passa da largura da tela;
- a ordem dos dois gráficos, a mesma escala e as mesmas subclasses e a soma
  de 100% de cada lado pela tabela acessível;
- em outubro de 2025, o mesmo número de séries nos dois gráficos e a mesma
  posição das barras de prazo longo;
- em 360 px, um rótulo para cada barra de setembro de 2026;
- o hover dos cards com e sem ponteiro e com movimento reduzido, inclusive
  que o painel não sobe.

Os testes de largura e de hover foram conferidos contra mutações: sem
`grid-cols-1`, o teste de largura falhou no celular com 702 px; com o painel
subindo 1 px no hover, depois de desligar a animação nesse estado, o teste
de hover falhou. `pnpm lint`,
`pnpm typecheck`, `pnpm build` e a suíte do Playwright, com 32 cenários
entre desktop e celular, passaram.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Visão Geral](011-overview-tab.md)
- [Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md)
- [Faixa de tolerância ajustável](018-adjustable-tolerance.md)
