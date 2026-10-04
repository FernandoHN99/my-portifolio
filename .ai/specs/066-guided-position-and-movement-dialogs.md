# 066 — Inclusão e movimentação por etapas obrigatórias

Estado: implementada e validada localmente em 2026-10-04; sem deploy ou commit.
Ajustes posteriores:

- as escolhas do movimento usam o `Picker` do projeto, e as datas, o campo do
  design system ([spec 069](069-date-picker-and-dialog-pickers.md));
- o rateio usa a classificação fixa ([spec 068](068-fixed-classification-and-asset-type.md));
- o Tesouro aceita preço próprio e valor em reais ([spec 070](070-treasury-own-value.md)).
Origem: ajustes 1 e 5 do usuário, após as specs 056 a 062.

## Problema e decisão

As escolhas “Saldo que já tinha / Aporte agora” complicavam a inclusão. O
formulário de movimentação expunha os tipos e os modos simultaneamente,
sem uma sequência clara de escolha, preenchimento e conferência.

O usuário pediu uma interface mais clara, etapas obrigatórias, validação das
telas antes de implementar e prioridade às movimentações manuais. A inclusão
passa a cadastrar o saldo atual como `OPENING`, automaticamente. A escolha
contábil e seu texto explicativo saem do formulário; o saldo inicial continua
identificado no histórico e não fabrica aporte ou custo de aquisição. Esta
é a interpretação aplicada ao pedido de simplificação; futuros aportes entram
por Movimentar, e nenhum registro anterior é convertido.

## Validação antes da implementação

O protótipo interativo [066-position-flows.html](../designs/066-position-flows.html)
foi criado e conferido no navegador antes de alterar os componentes do app.
Cobriu os três passos de movimentação e os quatro de inclusão, também em
430 × 932 px, referência de largura do iPhone 16 Plus, sem transbordamento.
As imagens de Valores, Conferir e Nova posição ficaram em
`artifacts/flow-preview/`, fora do Git. Os números do protótipo são exemplos.

## Comportamento implementado

### Movimentar e corrigir

1. **Movimento:** selecionar Aporte, Retirada ou Rendimento para avançar. Na
   correção, o tipo existente começa selecionado; saldo inicial mantém seu tipo.
2. **Valores:** selecionar como informar, pelo valor da operação ou pelo novo
   total. Só então aparecem os campos apropriados ao ativo e ao modo.
3. **Conferir:** prévia Antes → Movimento → Depois, com quantidade, preço
   executado, dinheiro movimentado e avaliação pela cotação do mês separados.
   Dia e observação ficam nesta etapa; só ela permite registrar ou corrigir.

- Quantidade e preço calculam valor; valor e preço calculam quantidade; valor
  e quantidade calculam preço. Campos calculados têm indicação visual e podem
  ser substituídos por informação digitada.
- Novo total aceita quantidade ou valor de mercado para ativos cotados, e
  saldo para ativos sem cotação. A diferença define o movimento. Uma inversão
  de direção avisa expressamente se será registrada Retirada ou Aporte.
- Valores digitados inválidos ou inconsistentes bloqueiam a conferência;
  não são silenciosamente substituídos por uma conta dos demais campos.
  Trocar o modo preserva os dados, mas campos ocultos não impedem avançar.
- Total zero permite retirada completa. Rendimento em dinheiro num ativo
  cotado continua sem criar unidades. Correção de saldo inicial mantém custo
  desconhecido, inclusive ao informar o novo total de mercado.
- Voltar mantém os campos; a etapa nova recebe foco no título para teclado
  e leitor de tela. A sequência indica progresso, sem atalhos para pular passos.
- Competência aberta, correção no próprio registro, ausência de cascata,
  separação do lápis e liquidação continuam conforme as specs 056 a 059.

### Adicionar posição

1. **Posição:** tipo, instituição e estratégia.
2. **Ativo:** ticker ou título quando aplicável, cotação conferida, nome,
   quantidade/saldo, vencimento, liquidez e conta corrente quando aplicáveis.
   Escolher título do Tesouro pode preencher seu nome automaticamente.
3. **Rateio:** classificação e pesos, totalizando 100%.
4. **Conferir:** resumo em duas colunas, inclusive no celular, com nome,
   instituição, tipo, ticker, quantidade, cotação e total destacado; depois,
   classificação, estratégia e vencimento, antes de Adicionar posição.

O avanço verifica a etapa atual; chegar à conferência também verifica os
campos das anteriores. O lápis conserva as três abas de atributos e valores
somente de leitura. Não há seleção de saldo inicial/aporte ou configuração
de cálculo pelo CDI, conforme a [spec 065](065-manual-fixed-income.md).

Uma expiração real da conferência do ticker inicia nova consulta e retorna à
etapa Ativo, conservando os demais dados. Não salva automaticamente. A falsa
expiração entre instâncias foi corrigida pela [spec 063](063-ticker-verification-during-save.md).

## Verificação

- `tests/e2e/position-transactions.spec.ts`, `position-form.spec.ts` e
  `treasury-position.spec.ts`: 24 cenários aprovados em Desktop Chrome e 24
  no WebKit com perfil Safari iPhone 16 Plus. Não salvam posições ou movimentos.
- Cobertura inclui escolhas obrigatórias, revisão antes de salvar, cálculo
  flexível, divergência entre três campos, retirada por novo total, dividendo
  sem unidades, lápis sem edição de valor e nome automático do Tesouro.
- `tests/unit/movement-input-validation.test.ts`: oito cenários aprovados,
  cobrindo entradas negativas/nulas/não finitas, campos ocultos, retirada total,
  dividendos, saldo inicial e resultado inválido após cálculo/arredondamento.
- Pickers e revisão mobile também foram adaptados; resultados na
  [spec 064](064-selic-and-dev-quotes.md). Inputs de pelo menos 16 px,
  rodapé acessível e ausência de transbordamento em retrato e paisagem.
- `pnpm check` e build local passaram, assim como os 28 testes unitários
  conjuntos de validação, ticker, Selic e Tesouro. Backend manual, liquidação, backup e virada de mês
  validados em schema isolado na [spec 065](065-manual-fixed-income.md).
- Imagens da interface implementada em `artifacts/flow-final/` e
  `artifacts/dialog-e2e/`, fora do Git. Referência emulada; aparelho físico
  não foi testado nesta sessão.

Os testes usam o servidor 3120 sobre `tx_adjustments_063`, com cotações
simuladas. Nenhum dado financeiro real foi alterado. A migração aditiva da
Selic é documentada separadamente na spec 064.

## Continuidade

Esta revisão substitui as escolhas de inclusão e a apresentação do diálogo
descritas na [spec 057](057-movement-form-and-attribute-pencil.md), preservando
suas regras financeiras. O estado conjunto desta rodada fica no
[índice](README.md), specs 063 a 066. Sem autorização para publicação.
