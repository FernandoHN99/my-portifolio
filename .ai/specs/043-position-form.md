# 043 — Formulário único da posição, lápis e lixeira na linha

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedido do usuário em 2026-10-03: "precisamos deixar uma interface única
centralizada tanto de adição quanto para edição… o forms tem que partir da
mesma estrutura… já ser possível escrever o 'Rateio da posição' e todas as
informações possíveis". O formulário é um diálogo com abas: "aba 1 as infos
comuns a todos, na 2 específicos daquele tipo, na 3 o rateio"; na edição,
"pode fazer sentido deixar alguns campos como read-only".

Também pediu: o botão "Editar posições" sai; no hover da linha aparecem um
lápis e uma lixeira, e o lápis abre o formulário, sem campos dentro da
tabela; a página da posição ganha "Editar posição", com o mesmo formulário; a
edição continua respeitando o mês aberto ou fechado
([spec 034](034-open-closed-months.md)).

## Comportamento

### Formulário (`src/modules/portfolio/ui/position-form-dialog.tsx`)

Um diálogo, "Adicionar posição" ou "Editar <ativo>", com três abas:

- **Geral**: tipo do ativo e instituição (na inclusão, a instituição aceita
  um nome novo), nome do ativo, quantidade ou saldo e estratégia;
- **Ativo**: o que depende do tipo. Ticker conferido no provedor do tipo,
  escolha da moeda da CoinGecko quando o símbolo tem várias
  ([spec 033](033-coingecko-coin-choice.md)), cotação em R$ quando o mês não a
  tem, moeda base, vencimento e liquidez;
- **Rateio**: as classificações (classe, subclasse, resgate e peso), com a
  soma ao vivo, a barra de progresso e o total no rótulo da aba.

Na inclusão, um ativo de nome existente é reaproveitado, com o rateio da
posição mais recente dele, e um nome novo cria o ativo ao salvar; a linha de
estado diz qual dos dois acontece. Renda fixa de mesmo nome só é reaproveitada
na instituição dela ([spec 040](040-simpler-position-entry.md)).

Na edição, tipo, instituição, ticker, moeda base e cotação do mês são só
leitura. Nome, vencimento e liquidez são do ativo e valem para todos os meses;
quantidade ou saldo, estratégia e rateio são da posição no mês.

As pendências (campos vazios, rateio fora de 100%, ticker não encontrado,
posição repetida na instituição) aparecem no rodapé ao tentar salvar, com a
aba de origem; o formulário vai para a primeira aba com pendência e marca as
abas com um ponto. Salvar grava na hora e mostra o aviso com "Desfazer".

### Na tabela de Posições

- sem "Editar posições": cada linha mostra o lápis e a lixeira no hover ou no
  foco, e sempre em telas de toque;
- a lixeira pede confirmação ("Remover <ativo>?"); a remoção pode ser
  desfeita pelo aviso;
- "Adicionar posição" abre o formulário vazio;
- num mês fechado não há incluir, lápis nem lixeira.

### Na página da posição

"Editar posição", no cabeçalho, abre o mesmo formulário com a posição da
competência selecionada. Fica desabilitado, com o motivo no título, quando o
mês está fechado ou a posição não existe nele.

### Servidor

`addPositionAction`, `editPositionAction` e `removePositionAction`
(`src/app/actions/edit-month.ts`) validam com zod e chamam `addPosition`,
`editPosition` e `removePosition` (`month-editing.ts`). O rateio precisa somar
100%, sem classificação repetida. A edição grava os atributos do ativo por
`applyAssetAttributes` (`asset-attributes.ts`), que refaz a chave do ativo
quando o nome ou o vencimento mudam. O desfazer restaura o mês e o estado
anterior dos ativos tocados.

Saíram: `add-position-dialog.tsx`, `asset-name-editor.tsx`,
`liquidity-editor.tsx`, `maturity-editor.tsx`, `position-drafts.ts` e o modo
de edição da tabela ([spec 019](019-pencil-edit-mode.md)). De
`edit-dialogs.tsx` ficaram as classes, os seletores e o `Field` comuns.

## Testes

- `tests/e2e/position-form.spec.ts`: abas, mês fechado, tipo e instituição
  nova, ticker e provedores, rateio, ativo reaproveitado, renda fixa por
  instituição, moeda da CoinGecko, lápis com a posição preenchida, lixeira com
  confirmação e a página da posição, sem salvar nada;
- `tests/e2e/support/position-form.ts`: `openEditableMonth`, que procura um
  mês aberto (a competência mais recente ou a anterior), e `positionRow`;
  substitui o antigo `support/edit-mode.ts`.

## Verificação

- no servidor do schema de teste (porta 3100): editar o Bitcoin 01 para 0,31,
  conferir na tabela e desfazer, voltando ao valor anterior;
- Playwright contra esse servidor, com a suíte inteira (ver a
  [spec 047](047-json-only-data.md)).

## Referências

- [Mês aberto ou fechado](034-open-closed-months.md)
- [Inclusão pelo tipo e nome livre](040-simpler-position-entry.md)
- [Tabela enxuta](044-compact-positions-table.md)
