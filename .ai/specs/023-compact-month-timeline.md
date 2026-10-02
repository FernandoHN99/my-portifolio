# 023 — Linha do tempo compacta

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

## Problema

O seletor global de mês da [spec 010](010-global-shell-month-selector.md)
listava todas as competências de todos os anos numa única faixa horizontal.
Com 31 competências, a faixa tinha 1.587 px de largura e rolava mesmo no
desktop de 1.280 px. O pedido do usuário, registrado em
[Reestruturação da UX](../context/ux-restructure.md), em "Ajustes pedidos em
2026-10-02, antes da previdência", foi este:

> "Componente das datas está muito esticado, deixar ele menor, talvez uma
> animação dos meses p entrar dentro do ano assim ele fica menor, algo do
> genero"

Fatos observados antes da mudança:

- as competências importadas vão de junho de 2023 a setembro de 2026, com
  lacunas: 2023 tem junho, julho, outubro e dezembro; 2024 não tem julho;
  2025 tem janeiro e de julho a dezembro;
- no celular (Pixel 7), a Visão Geral abria com a página deslocada 131 px
  para o lado. O `scrollIntoView` que centralizava o mês selecionado rolava
  também a página, que fica mais larga que a tela por causa da tabela
  "Comprar e vender" (ver "Questões em aberto").

## Objetivo

Deixar a linha do tempo curta: os anos viram cápsulas compactas e só o ano
aberto mostra os seus meses, que entram e saem de dentro do ano com animação.

## Comportamento

- cada ano é uma cápsula com o ano e, abaixo dele, doze marcas de 3 px com a
  variação de cada mês (verde para alta, vermelho para queda, apagada para
  mês sem competência);
- só um ano fica aberto. Ao abrir, a cápsula cresce e os meses saem de dentro
  do ano para a direita; o ano que fecha recolhe os meses para dentro dele.
  As duas coisas acontecem juntas, em 220 ms, com a curva de saída
  `cubic-bezier(0.23, 1, 0.32, 1)` já usada nas transições de aba;
- o ano aberto é o da competência selecionada. Abrir outro ano serve para
  procurar um mês e não troca a competência; ela só muda ao escolher um mês.
  Enquanto isso, a cápsula do ano da competência selecionada fica com borda e
  ano em verde, a marca do mês selecionado em branco e, para leitores de
  tela, a descrição "Competência selecionada: Fevereiro de 2026";
- o ano aberto para consulta vale só enquanto a competência não muda. Qualquer
  troca, pelo mês, pelas setas, pelo teclado, por "Mais recente", pelo gráfico
  ou pela URL, devolve a faixa ao ano da competência, e o ano consultado não
  reabre se a competência voltar à de antes;
- as setas ◀ ▶ ficam juntas à esquerda e percorrem mês a mês, atravessando os
  anos; as setas do teclado fazem o mesmo. Ao atravessar o ano, o ano novo
  abre sozinho;
- o mês selecionado continua preenchido em verde, com a barra de variação
  embaixo; "Mais recente" continua à direita, a partir de telas pequenas;
- o destaque do mês muda no clique, sem esperar o servidor; o conteúdo da
  página continua dentro da transição da [spec 015](015-seamless-transitions.md),
  com a barra fina de carregamento;
- com alterações não salvas, trocar de mês pede confirmação como antes; abrir
  outro ano não pede, porque não troca a competência;
- no celular, a faixa rola sozinha, sem mover a página, e mostra um
  esmaecimento na borda onde há mais conteúdo. Ela começa pelo fim, onde fica
  a competência mais recente. Quando a competência é a mais recente, o caso de
  abrir o app sem `?mes=`, ela já aparece no lugar certo antes de o JavaScript
  carregar; com uma competência mais antiga, só aparece depois que a página é
  hidratada e a faixa rola até ela;
- com `prefers-reduced-motion`, a troca de ano não anima a largura: os meses
  do ano novo apenas aparecem com um esmaecimento de 120 ms.

## Decisões tomadas

- "deixar ele menor" foi entendido como encurtar a faixa na horizontal. A
  altura ficou igual (57 px), para manter alvos de toque de 32 px;
- a frase "dos meses p entrar dentro do ano" foi interpretada literalmente:
  os meses ficam presos à borda direita do painel, que é recortado junto ao
  ano. Ao fechar, eles deslizam para dentro do ano; ao abrir, saem dele;
- abrir um ano não troca a competência, para que olhar outro ano não dispare
  uma busca no servidor nem a confirmação de alterações pendentes. É uma
  interpretação; ver "Questões em aberto";
- as setas foram agrupadas à esquerda porque a largura da faixa muda ao
  trocar de ano; uma seta à direita dos meses andaria sob o cursor de quem
  clica várias vezes seguidas;
- a troca de mês dentro do mesmo ano não ganhou animação além da cor, como
  antes: é a ação mais frequente e também é feita pelo teclado;
- as marcas dentro da cápsula fechada preservam a informação de alta e queda
  que antes ficava visível para todos os meses. Começaram com 2 px e a mesma
  opacidade das barras dos meses, e verde e vermelho mal se distinguiam numa
  tela comum; passaram a 3 px, em cor cheia, o que alarga cada cápsula fechada
  em 12 px;
- o componente deixou de usar `tablist` e `tab`, que não tinham painéis. A
  faixa é uma navegação "Competências"; cada ano é um botão com
  `aria-expanded`, e o ano aberto fica com `aria-disabled`, como no padrão de
  acordeão em que o painel aberto não fecha; cada mês é um botão com o nome
  completo e a variação no rótulo, por exemplo "Fevereiro de 2026, -12,96% no
  mês", e o selecionado tem `aria-current="date"`;
- se o foco estava num mês do ano que fecha, o foco passa para o mês
  selecionado do ano que abriu assim que o painel dele é montado, antes da
  animação terminar. Assim ele não se perde quando as setas são pressionadas
  várias vezes seguidas ou mantidas apertadas. Dentro do mesmo ano o foco
  fica onde estava, como antes desta fatia, porque as setas do teclado
  valem para a página inteira e não movem o foco;
- a cápsula do ano da competência recebe a descrição por
  `aria-describedby`, e não no nome, para que o nome do botão continue sendo
  só o ano;
- a faixa ganha `data-hydrated` quando o React a hidrata. Os testes de
  interface esperam por ele antes de clicar, em vez de inspecionar
  propriedades internas do React;
- nada foi adicionado às dependências nem a `globals.css`; a animação usa o
  `motion`, já instalado.

## Fora do escopo

- a largura da tabela "Comprar e vender" no celular;
- mudanças nos dados das competências ou na Visão Geral;
- Previdência.

## Questões em aberto

- confirmar com o usuário se abrir outro ano deve continuar sem trocar a
  competência ou se deve já selecionar um mês daquele ano;
- no celular, a seção "Comprar e vender" da Visão Geral fica com 682 px de
  largura numa tela de 412 px: a tabela tem largura mínima de 640 px e a
  grade em volta não limita a largura do item. A página inteira fica mais
  larga que a tela. Isso está em `overview-dashboard.tsx` e
  `rebalance-panel.tsx`, fora desta fatia.

## Critérios de aceite

- só os meses do ano aberto aparecem; os outros anos são cápsulas;
- trocar de ano fecha o atual e abre o novo com animação de até 250 ms, e
  sem animação de largura com movimento reduzido;
- no desktop de 1.280 px, a linha do tempo cabe sem rolagem;
- no celular, o mês selecionado aparece na faixa e a página não se desloca;
- o mês continua na URL, as setas e o teclado atravessam os anos e as
  alterações pendentes seguram a troca de mês;
- os testes existentes continuam passando;
- lint, tipos, build e testes de interface passam.

## Verificação

Num banco local criado pelas migrações e carregado com a importação do
Excel, em setembro de 2026, a faixa passou de 1.587 px para 649 px de largura
no desktop, sem rolagem, e o conjunto com as setas ocupa 731 px; com 2024
aberto, o ano com mais meses, ocupa 807 px. Antes das marcas de 3 px eram
601 px, 683 px e 759 px. No Pixel 7 a faixa rola dentro de 298 px e a página
ficou sem deslocamento, contra 131 px antes.

A animação foi amostrada quadro a quadro no navegador: ao abrir 2025 com 2026
aberto, os dois painéis mudam de largura juntos e terminam em cerca de
220 ms. Quadros com a animação desacelerada dez vezes mostraram os meses de
2026 deslizando para dentro do ano e os de 2025 saindo dele. As capturas
foram conferidas no desktop e no Pixel 7, inclusive o anel de foco dos meses
e o estado antes de o JavaScript carregar.

Oito cenários novos do Playwright em `tests/e2e/month-timeline.spec.ts`, sem
gravar nada: o ano aberto é o da competência; abrir outro ano não troca a
competência até escolher um mês e a cápsula do ano da competência a
descreve; as setas atravessam o ano e a competência volta igual ao
recarregar; consultar outro ano e voltar à competência pelas setas ou por
"Mais recente" reabre o ano dela; dois toques seguidos nas setas atravessando
o ano deixam o foco no mês que abriu; a faixa cabe no desktop e não desloca a
página no celular; alterações pendentes seguram a troca de mês, mas não a de
ano, e são descartadas; com movimento reduzido, nenhum quadro mostra um
painel de meses pela metade. Os cenários existentes de `home.spec.ts` não
precisaram de ajuste.

Na revisão da fatia, foram corrigidos o ano consultado que reabria sozinho
quando a competência voltava à de antes, o foco que caía no documento com
toques seguidos nas setas, as marcas pequenas demais e a falta de indicação
da competência para leitores de tela enquanto outro ano está aberto. Os
cenários do ano consultado e do foco falharam com a versão anterior do
componente e passam com a atual. A amostragem de largura por quadro foi
conferida nos dois modos: sem movimento reduzido ela registra painéis pela
metade durante a animação; com movimento reduzido, nenhum.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Navegação no topo e seletor global de mês](010-global-shell-month-selector.md)
- [Transições sem recarregamento](015-seamless-transitions.md)
