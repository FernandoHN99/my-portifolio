# 070 — Tesouro Direto com preço próprio e valor em reais

Estado: implementada e validada localmente em 2026-10-05. Sem commit ou deploy.
Origem: pedido do usuário em 2026-10-04: "para Tesouro Direto, pode trazer a
cotação dele, mas permita o usuário digitar o próprio valor; o mais importante é
trazer os títulos mesmo".

## Problema observado

- O catálogo oficial é o CSV de preços e taxas do Tesouro Transparente, com
  14,5 MB.
- A primeira carga leva alguns segundos. Enquanto isso, a lista de títulos
  abria com "Nenhuma opção encontrada", como se não houvesse títulos.

## Decisões

- O catálogo começa a carregar quando o tipo Tesouro Direto é escolhido, na
  primeira etapa (`prefetchTreasuryCatalog`). A lista compartilha a mesma
  consulta, renovada depois de 30 minutos, como o cache do servidor.
- Durante a carga, a lista diz "Carregando os títulos do Tesouro…".
- A ordem segue a vitrine do Tesouro: Selic, Prefixado, IPCA+, Renda+ e Educa+,
  cada um por vencimento.
- Depois de escolher o título, o campo "Preço do título (R$)" mostra o preço
  oficial como sugestão.
  - Em branco, vale o oficial.
  - Digitado, vale o preço do usuário, só para ele e só nesta competência: uma
    cotação à mão, como a da página de cotações.
  - O oficial continua gravado como cotação compartilhada e no histórico diário.
  - Fora do mês corrente, o preço é obrigatório, como antes.
- "Informar a posição por" escolhe entre a quantidade de títulos e o valor da
  posição em reais (o saldo que o banco mostra).
  - Pelo valor, a tela mostra quantos títulos ele compra pelo preço.
  - O servidor (`valueKind: "amount"`) grava o total digitado e a quantidade de
    total ÷ preço, com 12 casas.
- A subclasse vem do indexador do título ([spec 068](068-fixed-classification-and-asset-type.md)).

## Verificação

Em 2026-10-05:

- Catálogo real: a lista carregou os títulos oficiais.
- Um Tesouro IPCA+ 2035 pelo valor de R$ 10.000 mostrou 3,963316 títulos ao preço
  oficial e 3,333333 títulos com o preço próprio de R$ 3.000.
- `tests/e2e/treasury-position.spec.ts`:
  - quantidade pelo preço conferido e subclasse IPCA;
  - valor em reais com preço próprio no lugar do oficial, com 0,40 título, a
    subclasse Pós-fixado e "Preço informado" na conferência.
- Nenhuma posição foi salva nos dados reais. A gravação do preço próprio segue
  o caminho da cotação à mão já coberto pela integração da spec 063; uma
  inclusão real gravada continua pendente, como na spec 061.

## Arquivos

- `src/modules/portfolio/ui/treasury-picker.tsx`, `position-form-dialog.tsx`
- `src/modules/portfolio/application/month-editing.ts` (`ensureMonthQuote`, `valueKind`)
- `src/modules/quotes/domain/treasury.ts` (ordem do catálogo)
