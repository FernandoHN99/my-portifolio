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
- cada barra mostra o seu percentual quando o rótulo cabe sem invadir a
  barra vizinha; o tooltip de cada subclasse traz atual e ideal de cada
  prazo;
- os percentuais são sobre o total de renda fixa: no atual, as células somam
  100% do total atual da classe; no ideal, são as metas do grupo de renda
  fixa, que somam 100% do ideal da classe;
- os dois gráficos usam a mesma escala vertical e as mesmas subclasses, para
  que a comparação seja direta;
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
  reclassificados: aparecem como série própria apenas no gráfico em que
  ocorrem, e "-" aparece como "Sem prazo". Nos dados importados há
  Pós-fixado D+0 em meses de 2023 e 2024, Pós-fixado D+1 em julho de 2025 e
  BTC sem prazo classificado como renda fixa de outubro a dezembro de 2025;
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
  posições, parece a página tremendo, e porque um `transform` em painel muda
  a referência de elementos fixos ou fixados dentro dele;
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

- "Variação em 12 meses" usa a competência doze posições antes, não doze
  meses antes. Como faltam competências (julho de 2024 e de fevereiro a junho
  de 2025), em junho de 2026 o card compara com janeiro de 2025, dezessete
  meses antes; "Variação no mês" em julho de 2025 compara com janeiro de
  2025. O usuário deve decidir se o card passa a usar meses de calendário e
  mostrar "Histórico insuficiente" quando o mês não existir;
- a tabela de comprar e vender só lista combinações com posição atual; uma
  meta sem posição, como IPCA Curto em março de 2024, não aparece como
  "Comprar". Falta decidir se deve aparecer;
- a primeira competência do histórico é junho de 2023, com cinco posições;
  se "todo o período" deve começar em outra data, o usuário precisa indicar;
- os prazos D+0 e D+1 dentro de renda fixa e o BTC classificado como renda
  fixa no fim de 2025 parecem resíduos da planilha; não foram alterados.

## Critérios de aceite

- o card de renda fixa por duração mostra o atual em cima e o ideal
  embaixo, com subclasses no eixo horizontal e barras Curto, Médio e Longo
  rotuladas;
- os dois gráficos têm a mesma escala e as mesmas subclasses; cada lado soma
  100%;
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
de 0 a 40%. Outubro de 2025 mostrou a série "Sem prazo" do BTC só no
atual, julho de 2025 a série D+1 e maio de 2024 o aviso de competência sem
renda fixa. "Variação em todo o período" mostrou +502,11% e
"R$ 210.311,72 desde Jun/23", conferidos contra os totais de junho de 2023
(R$ 41.885,20) e setembro de 2026 no banco; junho de 2023 mostrou "—".

As capturas de tela foram revisadas no desktop e no Pixel 7 para Visão
Geral, Posições e Configuração. No desktop, os estilos calculados confirmaram
borda e fundo no hover dos painéis, sem `transform`, e a subida de 1 px nos
cards de indicador; no perfil de celular, `(hover: hover)` é falso e nada
muda. Antes da correção da grade, a Visão Geral no celular tinha 702 px de
largura; depois, 412 px.

O novo arquivo `tests/e2e/overview-adjustments.spec.ts` não grava nada:
confere o card de variação no período e a primeira competência, a ordem dos
dois gráficos, a mesma escala e as mesmas subclasses, a soma de 100% de cada
lado pela tabela acessível, e o hover dos cards com e sem ponteiro e com
movimento reduzido. `pnpm lint`, `pnpm typecheck`, `pnpm build` e a suíte do
Playwright, com 26 cenários entre desktop e celular, passaram.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Visão Geral](011-overview-tab.md)
- [Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md)
- [Faixa de tolerância ajustável](018-adjustable-tolerance.md)
