# 025 — Listas de seleção estilizadas

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

## Problema

Pedido do usuário em 2026-10-02, registrado em
[Reestruturação da UX](../context/ux-restructure.md), em "Ajustes pedidos em
2026-10-02, antes da previdência": "Deixar todos os picklists estilizados tb e
ao clicar no input do picklist ja aparecer as opções ao clicar".

Inventário feito no código antes da mudança:

- `positions-workspace.tsx`: `<select>` nativo da estratégia em cada linha no
  modo de edição;
- `edit-dialogs.tsx`, "Adicionar posição": três `<select>` nativos, de conta,
  ativo e estratégia;
- `edit-dialogs.tsx`, rateio da posição: classe, subclasse e duração eram
  `<input>` com `<datalist>`, cuja lista do navegador só aparece depois de
  digitar ou de um segundo clique;
- `multi-select-filter.tsx`: os cinco filtros de Posições (classe, subclasse,
  instituição, estratégia e moeda) já usavam o Menu do Base UI, estilizado,
  mas sem busca e com aparência própria;
- não há outras listas de seleção em `src/`. Os seletores segmentados
  (agrupar, recortes do rebalanceamento, empilhamento do gráfico) e a linha do
  tempo de meses não são listas e ficaram fora.

As listas nativas usavam a aparência do sistema, destoando do tema escuro.

## Objetivo

Todas as listas de seleção do aplicativo com a mesma aparência e o mesmo
comportamento: clicar no campo já mostra as opções, digitar filtra e a opção
escolhida fica marcada.

## Comportamento

- clicar ou tocar no campo abre a lista com todas as opções, mesmo quando já
  há um valor escolhido; chegar ao campo pelo Tab também abre a lista; o foco
  automático ao abrir um diálogo não abre;
- digitar filtra sem diferenciar maiúsculas nem acentos; nos ativos o filtro
  também considera o ticker, mostrado à direita da opção;
- seta para baixo abre ou percorre a lista, Enter escolhe; com a lista
  aberta, Escape fecha só a lista, sem fechar o diálogo ou o painel lateral;
  com a lista fechada, Escape segue para o diálogo ou o painel e o fecha, como
  num select nativo, sem limpar o campo;
- fora da lista aberta, o campo sempre mostra a opção escolhida. Apagar todo o
  texto abre a lista com todas as opções e deixa o valor atual esmaecido no
  campo; o valor só muda quando outra opção é escolhida, e sair do campo ou
  Escape voltam a mostrá-lo;
- a opção atual tem marca de seleção; sem resultado, a lista mostra "Nenhuma
  opção encontrada", "Nenhuma conta encontrada" ou "Nenhum ativo encontrado";
- a lista abre acima de diálogos, do painel do rateio e da barra do modo de
  edição, ocupa no máximo a altura e a largura disponíveis e troca de lado
  quando não cabe abaixo do campo;
- no celular, listas curtas sem criação de valor não abrem o teclado virtual;
  listas longas, como conta e ativo, abrem para permitir filtrar;
- filtros de Posições: o botão continua com o nome e a contagem; a lista tem
  busca, caixas de marcação e "Limpar seleção" no rodapé; marcar várias
  opções mantém o texto da busca; "Limpar seleção" fecha a lista e devolve o
  foco ao botão do filtro, como o menu anterior;
- estratégia na tabela: com a lista fechada, Enter e as setas para cima e para
  baixo trocam de linha, como no campo de quantidade; Alt+seta para baixo,
  clicar ou digitar abrem a lista; com ela aberta, as setas percorrem as
  opções e Enter escolhe; o campo alterado ganha a borda de alteração, como o
  de quantidade;
- rateio: classe, subclasse e duração listam os valores já usados; um valor
  novo digitado aparece como "Usar “valor”" e só vale depois de escolhido;
  sair do campo sem escolher volta ao valor anterior.

## Componentes

- `src/components/ui/combobox.tsx`: peças estilizadas sobre o Combobox do Base
  UI, no padrão do shadcn: campo com o próprio input, gatilho em botão,
  conteúdo flutuante, busca dentro da lista, item com marca de seleção ou
  caixa de marcação, estado vazio e rodapé;
- `src/components/ui/picker.tsx`: `Picker`, lista de seleção única a partir de
  opções `{ value, label, hint? }`. Aceita `searchable`, para forçar ou impedir
  o teclado virtual, e `onCreate` com `createLabel`: quando informados, o texto
  digitado sem opção correspondente vira um item extra, por padrão
  "Criar “texto”", e escolhê-lo chama `onCreate(texto)`. O rateio usa esse
  recurso com o rótulo "Usar". A [spec 026](026-new-position-entities.md)
  acrescentou `createOnMatch`, que oferece criar mesmo quando o texto coincide
  com uma opção, usado no ativo, e trocou o campo "Conta" do diálogo por
  "Instituição" e "Conta"; com criação, a lista de ativos não fica mais vazia.

## Decisões tomadas

- interpretação das palavras do usuário: "todos os picklists" inclui os
  filtros de Posições, que já eram estilizados, para que tudo tenha a mesma
  aparência; "ao clicar no input já aparecer as opções" foi entendido como a
  lista abrir no clique do próprio campo, sem digitar, o que o `datalist` do
  rateio não fazia;
- abrir também ao chegar pelo Tab veio da orientação da fatia; abrir no foco
  automático do diálogo foi descartado para a lista não cobrir o diálogo
  enquanto ele aparece;
- todas as listas usam o Combobox do Base UI, e não o Select, para ter campo
  digitável, filtro e o recurso de criação que a
  [spec 026](026-new-position-entities.md) usará para conta, instituição e
  ativo novos; nenhuma entidade é criada nesta fatia;
- os filtros sempre mostram a busca, mesmo em listas curtas como moeda: sem
  um campo, o Combobox não percorre as opções pelo teclado, conferido no
  teste; ao abrir pelo toque, o Base UI foca a lista e não a busca, o que
  evita o teclado virtual, conforme o código do `ComboboxPopup`;
- o rateio continua aceitando valor livre, como o `datalist`, mas exige
  escolher "Usar “valor”", o que reduz erros de digitação em classes que
  alimentam as análises;
- ao receber o foco, o texto do campo fica selecionado, de modo que digitar
  substitui o valor, como já acontece no campo de quantidade; no toque, em
  listas sem teclado virtual, o texto não é selecionado;
- nomes acessíveis: "Estratégia de <ativo>" foi mantido; os campos do diálogo
  passaram a se chamar "Conta", "Ativo" e "Estratégia"; os do rateio,
  "Classe da classificação 1" e semelhantes, contendo o rótulo visível;
- os filtros passaram de botão com menu para combobox com opções, e o nome
  inclui a contagem, como "Classe 1 selecionado"; dois trechos de
  `tests/e2e/home.spec.ts` foram ajustados para os novos papéis;
- Enter na estratégia com a lista fechada passou a descer de linha; antes não
  fazia nada no `<select>`;
- na revisão de 2026-10-02, o `Picker` passou a controlar o texto do campo
  (`inputValue`): fora da lista aberta ele é sempre o rótulo da opção
  escolhida, e com ela aberta é o que se digitou. Antes, o Base UI esvaziava
  o campo com Escape na lista fechada ou ao apagar o texto e sair, enquanto o
  valor guardado continuava o anterior, e salvar usava um valor que a tela não
  mostrava. A lista não tem opção vazia, então pedidos de limpar o valor são
  cancelados;
- Escape com a lista fechada deixa de passar pelo Base UI, que limpava o
  campo e interrompia a tecla quando havia valor escolhido; assim o diálogo de
  nova posição e o painel do rateio voltam a fechar com Escape, como com os
  campos nativos;
- interpretação: apagar todo o texto com a lista fechada abre a lista em vez
  de não fazer nada, para que selecionar e apagar sirva para recomeçar a
  busca; o valor atual aparece esmaecido no lugar do placeholder enquanto o
  campo está vazio;
- "Limpar seleção" fecha a lista porque o botão some ao limpar e o foco caía
  na página; fechar devolve o foco ao filtro, como no menu anterior, e evita
  abrir o teclado virtual no celular, o que focar a busca faria;
- sem novas dependências e sem mudança em `globals.css`; as cores vêm dos
  tokens existentes.

## Fora do escopo

- criar conta, instituição ou ativo pela lista, que fica com a
  [spec 026](026-new-position-entities.md);
- filtrar as subclasses do rateio pela classe escolhida, porque o catálogo de
  edição entrega listas independentes;
- seletores segmentados e a linha do tempo de meses;
- Previdência.

## Questões em aberto

- os campos mantêm o texto de 12 px do restante do aplicativo; o Safari do
  iPhone amplia a página ao focar campos com texto menor que 16 px. Não foi
  verificado em aparelho, e o mesmo vale para todos os campos atuais;
- se o rateio deve recusar classes fora da lista em vez de oferecer "Usar".

## Critérios de aceite

- não existe `<select>` nem `<datalist>` no aplicativo;
- clicar em qualquer lista de seleção mostra as opções na hora;
- conta e ativo filtram ao digitar, inclusive o ativo pelo ticker;
- a opção escolhida aparece marcada e a lista vazia mostra mensagem;
- a lista aparece acima de diálogos e do painel do rateio, no computador e no
  celular;
- a estratégia na tabela mantém Enter e setas entre linhas com a lista
  fechada;
- os filtros mantêm a contagem no botão e a URL;
- lint, tipos, build e testes de interface passam.

## Verificação

Em bancos locais descartáveis criados pelas migrações e carregados com a
importação do Excel (`my_portifolio_s025` e `my_portifolio_s025b`), pela
interface: a estratégia do Bitcoin 01 trocada para Hedge na lista da tabela;
uma posição incluída escolhendo a conta "C6 · Principal" ao digitar "c6", o
ativo "Bitcoin 03 - Viagem" ao digitar parte do nome e a estratégia
Satellite; e o rateio do Bitcoin 01 com a classe nova "Classe teste" por
"Usar" e a duração Longo. Depois de salvar, o banco tinha a estratégia, a
nova posição com 0,01 e o rateio gravados. Esses dois bancos ainda guardam
essas gravações e não foram apagados; a suíte rodou em `my_portifolio_s025c`,
recém-importado e sem gravações. Os três podem ser apagados ao integrar a
fatia.

Na correção da revisão, também em `my_portifolio_s025b`: Escape com a lista
fechada e texto apagado na estratégia da ETF - SIVR, sem gravação; a
Flexible Account trocada para Satellite; e uma posição incluída com a conta
"Chainless · Principal", que continuou na tela depois de apagar o texto e sair
pelo Tab, o ativo Porquinho, 123,45 e a estratégia Hedge, mantida depois de
apagar o texto e usar Escape. Depois de salvar, o banco tinha exatamente o
que a tela mostrava, e a SIVR seguia sem alteração.

Os cenários novos do Playwright, em `tests/e2e/styled-pickers.spec.ts`, não
gravam nada: filtro de instituição com busca, marcação e "Limpar seleção",
que fecha a lista e devolve o foco ao filtro; listas do diálogo de nova
posição abrindo no clique, filtrando, mostrando o estado vazio, mantendo a
conta depois de apagar o texto e sair pelo Tab, fechando só a lista com
Escape e, com a lista fechada, fechando o diálogo com Escape; estratégia da
tabela mantendo o valor com Escape na lista fechada e depois de apagar o
texto, sem alteração pendente, com as setas entre linhas, Alt+seta, filtro e
Enter, descartando no fim, só no computador, porque a coluna fica oculta no
celular; e rateio mostrando todas as classes, voltando ao valor anterior ao
sair sem escolher, aceitando "Usar", fechando só a lista com Escape e, com
ela fechada, fechando o painel. Também foram conferidas capturas no
computador e no Pixel 7 de cada lista aberta e, na revisão, do campo apagado
com a lista aberta, do valor restaurado e do filtro depois de limpar.

`pnpm lint`, `pnpm typecheck` e `pnpm build` passaram, também depois da
correção da revisão. A suíte do Playwright, no computador e no Pixel 7,
passou com 27 cenários; o da estratégia na tabela é pulado no celular, onde a
coluna fica oculta. As novas verificações de Escape, texto apagado e foco do
filtro falham com a versão anterior do `Picker` e do filtro.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Modo de edição com lápis](019-pencil-edit-mode.md)
- [Posições: edição](017-positions-editing.md)
- [Posições: filtros e consulta](013-positions-filters.md)
- `node_modules/@base-ui/react/docs/react/components/combobox.md`
