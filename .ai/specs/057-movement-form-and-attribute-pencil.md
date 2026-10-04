# 057 — Formulário de movimentação e lápis só de atributos

Estado: concluída localmente em 2026-10-04 (sem deploy).
Definida em: 2026-10-04

Revisão posterior do mesmo dia: a [spec 066](066-guided-position-and-movement-dialogs.md)
substitui as escolhas na inclusão por saldo inicial automático e reorganiza a
movimentação em etapas obrigatórias. As regras financeiras abaixo permanecem
como referência; a apresentação original fica como histórico.

## Problema

Fatia B do [Prompt de continuidade](../context/position-transactions-prompt.md)
(seções 1 e 2): o lápis passa a editar só os atributos da posição, os valores
mudam por movimentações, e um formulário único, ao lado do lápis, registra e
corrige aporte, retirada e rendimento com preenchimento flexível.

## Comportamento

### Lápis

- edita nome, estratégia, rateio, vencimento, liquidez e conta corrente; a
  quantidade ou o saldo aparece sem campo, com o aviso "Para mudar a quantidade
  ou o saldo, use Movimentar";
- o servidor não aceita mais quantidade nem saldo na edição (`editSchema` sem
  `value`; `editPosition` não toca na quantidade);
- na inclusão, o valor entra como **Saldo que já tinha** (padrão, saldo inicial
  sem custo) ou **Aporte agora**, com o preço executado opcional (sem ele, a
  cotação do mês).

### Formulário de movimentação

- aberto pelas setas ao lado do lápis em Posições e por "Movimentar" na página da
  posição; na lista de movimentações, o lápis de cada uma do mês aberto abre o
  mesmo formulário para **corrigir aquela movimentação**, no lugar;
- tipo: Aporte, Retirada ou Rendimento (o saldo inicial não troca de tipo);
- dois modos, alternáveis sem perder o que foi digitado:
  - **Valor desta operação**: quantidade, preço executado e valor; dois quaisquer
    calculam o terceiro. Só com a quantidade ou só com o valor, a cotação do mês
    sugere o preço, marcada como "cotação do mês";
  - **Novo total da posição**: a nova quantidade (ou o novo saldo, ou o novo
    valor de mercado, que a cotação do mês converte em quantidade); a diferença
    vira a movimentação, e um total menor que o atual troca para Retirada. O
    preço executado continua separado e define o dinheiro movimentado;
- campos calculados aparecem com o selo "calculado" e borda tracejada; digitar
  num deles passa a valer o digitado;
- os três campos digitados sem fechar mostram a divergência ("Quantidade ×
  preço dá …, diferente do valor digitado") e impedem salvar, sem trocar o que
  foi digitado; faltando um dado, o aviso pede só ele;
- rendimento num ativo cotado sem quantidade é dinheiro recebido (dividendos),
  sem criar unidades;
- **prévia Antes → Movimentação → Depois**, com a quantidade, o dinheiro
  movimentado e o valor de mercado pela cotação do mês;
- no saldo em reais, só o valor (ou o novo saldo); no caixa em dólar, dólares,
  novo saldo e câmbio executado;
- aportes e retiradas comuns não movimentam caixa automaticamente.

Cálculo: `resolveMovement` em `src/modules/portfolio/domain/position-transactions.ts`.

## Critérios de aceite

Os exemplos do briefing:

- 10 unidades a R$ 30, compra de 2 a R$ 25: operação de R$ 50, 12 unidades e
  R$ 360 de mercado;
- alvo de R$ 360 de mercado com preço executado de R$ 25: 2 unidades e R$ 50;
- aporte de R$ 60 a R$ 25: 2,4 unidades (R$ 372 de mercado);
- saldo de R$ 10.000 para R$ 10.500: aporte de R$ 500; com Rendimento
  escolhido, rendimento de R$ 500; para R$ 9.500, retirada de R$ 500;
- dividendo de R$ 12 sem quantidade: a posição continua com 10 unidades;
- corrigir um aporte de R$ 500 para R$ 1.000 muda aquele registro.

## Verificação

Em 2026-10-04:

- `resolveMovement` conferido com todos os exemplos acima por roteiro;
- `tests/e2e/position-transactions.spec.ts` (sem salvar): no VOO, só a
  quantidade usa a cotação do mês como preço; 2 a R$ 25 dá R$ 50; R$ 60 a
  R$ 25 dá 2,4; os três sem fechar mostram a divergência e travam o botão; o novo
  total 0,5 vira retirada; num saldo, o novo saldo de R$ 1 vira retirada e o
  rendimento fica disponível; a inclusão começa em "Saldo que já tinha";
- `tests/e2e/position-form.spec.ts`: o lápis mostra a quantidade e o saldo sem
  campo, com o aviso de usar Movimentar;
- a correção no lugar e o lápis sem valor foram conferidos no schema de teste
  ([spec 056](056-position-transactions.md)).

## Referências

- [Transações: base do mês](056-position-transactions.md)
- [Formulário único da posição](043-position-form.md)
