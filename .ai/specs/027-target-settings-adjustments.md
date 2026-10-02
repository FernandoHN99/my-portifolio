# 027 — Ajustes na configuração de metas

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

## Problema

Pedidos do usuário em 2026-10-02, registrados em
[Reestruturação da UX](../context/ux-restructure.md), em "Ajustes pedidos em
2026-10-02, antes da previdência":

- "o slider permitir uma variacao de 1% no minmo pois de 0,5 em meio ele fica
  quebrando ao deslizar, mas permitir valor quebrado se digitado!";
- "Mantenha o Restaurar padrão do Excel por precaução!";
- "Ao selecionar algum aba da Prévia de comprar e vender e dar um slider a aba
  Classe volta automaticamente remover isso!".

Fatos observados antes da mudança, no banco local carregado com a planilha:

- os deslizantes das metas e o da tolerância da
  [spec 018](018-adjustable-tolerance.md) eram `input type="range"` nativos
  com passo de 0,5; ao arrastar o de Caixa, o campo passava por 13,5, 14,5,
  17,5, 18, 22,5 e assim por diante;
- cada alteração de meta chamava `setPreviewScope(item.scope)`, levando a
  prévia de volta para a aba do grupo editado; com a aba Moeda aberta, mexer em
  Caixa voltava para Classe;
- cada passo do arraste redesenhava o editor inteiro, com as 38 metas e a
  tabela da prévia; no desktop, um arraste de 30 passos gerava duas tarefas
  longas de 52 a 60 ms no servidor de desenvolvimento;
- um `input type="range"` com passo 1 exibiria um valor digitado como 32,5 na
  posição de 33, porque o navegador ajusta o valor ao passo; o plano do Excel
  tem BTC com 32,5% e USD com 28,5%.

## Objetivo

O deslizante anda de 1 em 1 ponto sem produzir valores quebrados; o campo
numérico continua aceitando valor quebrado; a aba da prévia só muda quando o
usuário clica nela; "Restaurar padrão do Excel" continua disponível.

## Comportamento

- todos os deslizantes de meta e o da tolerância andam de 1 em 1 ponto, ao
  arrastar, ao clicar no trilho com o mouse e pelas setas do teclado;
- o campo numérico ao lado aceita valor quebrado, como 12,5, com as mesmas
  validações de antes: metas de 0 a 100 e tolerância de 0 a 20 com até duas
  casas;
- um valor quebrado digitado aparece no deslizante na posição exata e não é
  alterado enquanto o deslizante não for movido; pressionar o polegar com o
  mouse, sem arrastar, não muda o valor;
- a partir de um valor quebrado, as setas vão para o inteiro seguinte ou
  anterior: de 12,5, a seta para a direita leva a 13 e a seta para a esquerda
  leva a 12;
- Shift com as setas, Page Up e Page Down andam 10 pontos nas metas e 5 na
  tolerância; a partir de um valor quebrado, vão até o inteiro mais distante
  sem passar desse passo: de 12,5, Page Up leva a 22 e Page Down leva a 3;
- no toque, encostar o dedo no deslizante, no polegar ou no trilho, não muda
  o valor; só um arraste horizontal muda, de 1 em 1 ponto, com o polegar
  acompanhando o dedo; um gesto vertical que comece sobre o deslizante rola a
  página;
- editar uma meta ou a tolerância, por campo, deslizante ou teclado, não troca
  a aba da prévia de comprar e vender; a aba só muda pelo clique;
- "Restaurar padrão do Excel" continua preenchendo o rascunho com as metas
  importadas e a tolerância 2, sem gravar, como na
  [spec 014](014-target-settings.md) e na [spec 018](018-adjustable-tolerance.md).

## Decisões tomadas

- interpretação registrada: "fica quebrando ao deslizar" foi lida como "fica
  produzindo valores quebrados ao deslizar", o mesmo sentido de "valor
  quebrado" no fim da frase do usuário; mesmo assim o arraste foi deixado mais
  leve, caso o usuário também tenha percebido travamento;
- o passo de 1 ponto vale também para o deslizante da tolerância, por ser o
  mesmo controle e a mesma queixa; o campo da tolerância continua aceitando
  duas casas;
- os deslizantes passaram a usar o `Slider` do Base UI, já instalado, no lugar
  do `input type="range"` nativo: ele exibe o valor controlado sem arredondar,
  ganha o visual do tema escuro em vez do padrão do navegador e mantém o
  `input type="range"` oculto com `aria-label`, por isso "Meta de X" e "Faixa
  de tolerância" continuam valendo para leitores de tela e testes;
- o deslizante informa o valor a leitores de tela em pt-BR, como "12,5%" e
  "2 pontos percentuais";
- o ajuste das setas a partir de valor quebrado foi feito no próprio
  componente, porque o Base UI arredonda primeiro e depois soma o passo, o que
  levaria 12,5 a 14;
- para o arraste ficar leve, cada linha de meta é memorizada e só a linha
  movida é redesenhada; a prévia é recalculada a partir do rascunho adiado com
  `useDeferredValue`, sem bloquear o polegar; os formatadores numéricos do
  editor passaram a ser criados uma vez só;
- a matriz de renda fixa continua só com campos numéricos, sem deslizante,
  como antes;
- o toque é tratado pelo próprio componente, e não pelo Base UI. O Base UI
  muda o valor no `touchstart` e, com `touch-action: none`, impedia a rolagem:
  na revisão, um gesto vertical sobre o deslizante de Caixa levou a meta de
  15 a 78 sem rolar a página. Agora o controle usa `touch-action: pan-y`, o
  toque é interceptado na raiz do deslizante antes de chegar ao Base UI e só
  vira arraste depois de o dedo andar 8 pixels na horizontal, mais do que na
  vertical; o mouse continua com o Base UI;
- interpretação registrada: no toque, tocar sem arrastar não muda o valor nem
  no trilho. Assim um toque para parar a rolagem ou um toque acidental não
  altera metas nem arredonda os valores quebrados do Excel, como BTC 32,5 e
  USD 28,5. Com o mouse, clicar no trilho continua levando o polegar ao ponto
  clicado;
- a regra do valor quebrado também vale para ajustes que passam pelo
  `input type="range"` oculto, como os gestos de leitores de tela: o
  navegador guarda nele o valor ajustado ao passo, 16 para 15,5, e sem a regra
  um ajuste para cima levaria a 17;
- o deslizante passou para `src/modules/portfolio/ui/step-slider.tsx`, para
  manter o editor de metas legível;
- o servidor, as ações e as regras de validação não mudaram; a mudança é só de
  interface.

## Limites conhecidos

- o gesto de toque foi verificado na emulação do Pixel 7 do Chrome, com
  eventos de toque enviados pelo protocolo do navegador, que passam pela
  rolagem e pelo `touch-action` reais; não foi testado em aparelho real;
- o `input type="range"` oculto continua guardando o valor ajustado ao passo,
  16 para 15,5. O Chrome informa 15,5 e "15,5%" aos leitores de tela, mas
  ferramentas que leem esse campo direto, como o `ariaSnapshot` do
  Playwright, mostram 16;
- a tarefa longa única no perfil de celular, descrita em Verificação, não foi
  eliminada.

## Fora do escopo

- deslizantes na matriz de renda fixa;
- criar ou remover categorias de metas;
- Previdência.

## Critérios de aceite

- arrastar um deslizante produz apenas valores inteiros;
- um valor quebrado digitado é exibido sem alteração até o deslizante ser
  movido;
- no toque, um gesto vertical sobre o deslizante rola a página e não muda a
  meta, e tocar sem arrastar não muda o valor;
- editar uma meta não troca a aba da prévia;
- "Restaurar padrão do Excel" volta as metas importadas e a tolerância 2;
- lint, tipos, build e testes de interface passam.

## Verificação

Feita em 2026-10-02, num banco local criado pelas migrações e carregado com a
importação do Excel, num servidor de desenvolvimento próprio.

Antes da mudança, um cenário descartável arrastou o deslizante de Caixa com a
aba Moeda aberta: apareceram valores como 13,5, 17,5 e 22,5 e a aba voltou para
Classe. Depois da mudança, o mesmo arraste passou só por inteiros, de 16 a 42,
e a aba Moeda permaneceu. No desktop, as tarefas longas de 52 a 60 ms durante o
arraste deixaram de aparecer; no perfil de celular continuou havendo uma única
tarefa longa por arraste, e não uma por passo, de 71 a 97 ms antes e de cerca
de 110 ms depois, medida no servidor de desenvolvimento. Num rastreamento do
Chrome, a maior tarefa do arraste ficou em torno de 37 ms, dentro de um quadro
de animação.

Gravações conferidas no banco: Caixa e Reserva movidos pelo teclado no
deslizante, BTC 31,25 e USD 29,75 digitados e tolerância 3 pelo deslizante
geraram uma versão com esses valores e 34 de 38 metas mantendo a origem no
Excel; "Restaurar padrão do Excel" seguido de salvar gerou nova versão vigente
com tolerância 2 e as 38 metas com a origem recuperada.

O novo arquivo `tests/e2e/target-settings-adjustments.spec.ts` tem quatro
cenários, sem gravar: arraste só com inteiros e seta somando 1; valor quebrado
exibido com `aria-valuenow` exato e setas indo ao inteiro seguinte ou
anterior, também na tolerância; aba Moeda mantida ao editar por campo,
deslizante e tolerância; e restauração do Excel com tolerância 2 e BTC 32,5
exibido sem arredondar. Os quatro falham com o código anterior e passam com o
novo. A suíte completa passou com 28 cenários no desktop e no celular, e os
novos cenários passaram 32 vezes seguidas. `pnpm lint`, `pnpm typecheck` e
`pnpm build` passaram. As capturas de desktop e celular foram conferidas.

Correções da revisão, também em 2026-10-02, no mesmo banco e servidor. A
revisão reproduziu, no perfil de celular, que um gesto vertical de 250 pixels
sobre o deslizante de Caixa não rolava a página e mudava a meta de 15 para 78;
a mesma medição, repetida antes da correção, deu o mesmo resultado. Depois da
correção, gestos verticais começando a 15% e a 75% do deslizante e sobre o
polegar rolaram a página, de 0 para cerca de 600 pixels, com Caixa mantida;
tocar no polegar e no trilho depois de digitar 15,5 manteve 15,5; um arraste
horizontal de 45 pixels a partir do polegar passou só por inteiros, de 22 a
50, com o polegar acompanhando o dedo. Pelo teclado, de 15,5: Shift com seta
para a direita e Page Up levaram a 25, Shift com seta para a esquerda e Page
Down a 6, Home a 0 e End a 100; de 95,5, Page Up parou em 100; na tolerância,
de 2,25, Page Up levou a 7. Pelo `input type="range"` oculto, `stepUp` a
partir de 15,5 levou a 16, e não mais a 17, e `stepDown` a partir de 15,3
levou a 15. Uma tolerância arrastada pelo toque até 6 foi salva e gerou nova
versão com 6; em seguida a tolerância 2 foi salva de novo.

O arquivo de testes ganhou, no cenário do valor quebrado, Shift com as setas,
Page Up, Page Down e o ajuste pelo campo oculto, e dois cenários só do
celular com toque real: rolagem sobre o deslizante sem mudar a meta, com
toques no polegar e no trilho mantendo 15,5, e arraste horizontal só com
inteiros. O cenário do valor quebrado e o da rolagem falham com o código
anterior; o do arraste horizontal passa nos dois e protege o arraste pelo
toque. A suíte completa passou duas vezes com 30 cenários e 2 pulados, os de
toque no perfil de desktop; os cenários da spec passaram 8 vezes seguidas nos
dois perfis. `pnpm lint`, `pnpm typecheck` e `pnpm build` passaram. As
capturas de desktop e celular, inclusive durante o arraste pelo toque, foram
conferidas.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Configuração da carteira](014-target-settings.md)
- [Faixa de tolerância ajustável](018-adjustable-tolerance.md)
