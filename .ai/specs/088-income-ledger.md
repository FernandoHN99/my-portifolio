# 088 — Recebimentos: entradas, saídas e holerites do mês

Estado: implementada e conferida localmente em 2026-10-07; publicação junto com
as specs 089 a 092.
Origem: pedido do usuário em 2026-10-07, com a tabela de entradas e saídas do
Excel, o gráfico "Balanço Mensal" e o holerite de setembro/26 como exemplo.

## Decisões

- **Área por concessão**, como Gastos familiares (spec 081): módulo `INCOME`
  em Finanças, só para `nandohneto@gmail.com` (gravado pela migração
  `20261008090100_income_tables` ou por `pnpm auth:access grant <e-mail>
  recebimentos`). Página `/recebimentos`; sem a concessão, 404 nas páginas e
  rotas.
- **Um registro por mês** (`income_months`, único por usuário e mês), com os
  valores da tabela do Excel: salário líquido + extras (um campo só), VA/VR,
  cartão, PIX e VA/VR gasto. Campo vazio é "não lançado" (nulo), diferente de
  zero; um mês só com holerite fica fora do gráfico e mostra "—" na tabela.
  Entradas, saídas e balanço são derivados e nunca guardados.
- **Holerites dentro do mês** (decisão do usuário: o holerite é lançado no mês
  de Recebimentos e a Previdência só lê). Cada linha (`income_payslips`) tem:
  - nome por tipo, com opções padrão (Salário, Férias, 13º salário, PLR e
    Outro, este com nome livre), pedido do usuário em 2026-10-07;
  - empresa (sugerida pela última usada), início e fim dentro do mês do
    registro, salário bruto (total de vencimentos) e "proporcional"
    ("Necessário calcular" da planilha), marcado sozinho quando o período não
    cobre o mês inteiro e editável;
  - troca de emprego no mês = duas linhas (como março e maio de 2025).
- **Renda da linha:** proporcional = bruto × dias ÷ 30 (mês comercial da
  planilha), arredondada por linha; senão, o bruto inteiro. 13º salário e PLR
  aparecem, mas ficam fora da renda tributável (tributação exclusiva).
- **Tela:** badges de ano (`?ano=`), cards Entradas, Saídas, Poupado e Salário
  bruto, gráfico Gastos × Poupado (barras agrupadas) e a tabela mês a mês
  (Entradas, Saídas, Balanço e Bruto, com totais) no computador a partir de
  `xl`; abaixo disso, um bloco por mês. `?mes=AAAA-MM` abre o mês (links da
  Previdência). Diálogo único para incluir e editar; excluir tem Desfazer.
- **Cores:** seguem o [guia de estilos](../../docs/style-guide.md) da
  [spec 090](090-shared-visual-language.md): valores com `primary`/atenção e
  zero neutro; o gráfico mantém a paleta acessível da spec 038.
- Dinheiro e competência ficam em `src/lib/money.ts` e
  `src/lib/competence.ts`, agora comuns a Gastos familiares e Recebimentos.

## Conferência local (2026-10-07)

Dados da planilha carregados na conta local (spec 092). Em 2026: Entradas
R$ 91.157,85, Saídas R$ 34.953,09 e Poupado R$ 56.204,76, iguais aos totais do
Excel, com o balanço de cada mês igual ao gráfico (Jan +5.157,67 … Ago
+4.554,90; Set +1.100,00, só com VA/VR).

## Ponto aberto

- O holerite de setembro/26 mostra que os R$ 15.443,55 de vencimentos já
  incluem as férias (Férias no Mês R$ 1.480,53 + 1/3 R$ 497,35 + Média
  R$ 11,51 = R$ 1.989,39). O usuário manteve as duas linhas (férias e
  salário); somadas, as férias contam duas vezes na renda de setembro
  (Bruto R$ 17.432,94) e o limite de 12% de 2026 sobe R$ 238,73. Se ele
  confirmar a duplicidade, basta remover a linha de férias no mês.
- Anexar o PDF do holerite ao mês fica para depois (sem definição técnica).

## Verificação

- `tests/unit/income.test.ts`: totais de 2026 do Excel, renda proporcional
  (R$ 218,83, R$ 6.766,67, R$ 2.100,00, R$ 7.000,00), 13º/PLR fora da base e
  regras do período.
- `tests/integration/income.test.ts` (schema `recebimentos_teste`): concessão,
  escopo por usuário, pedido repetido, mês único, troca dos holerites,
  período fora do mês, exclusão com Desfazer e CHECKs do banco.
- `tests/e2e/income.spec.ts`: sem a concessão, 404 e sem menu; com ela
  (servidor `recebimentos-teste` do `.claude/launch.json`), cards, gráfico,
  tabela e nenhum transbordo em 320, 375 e 430 px.
- Conferência no navegador (servidor de teste, usuário de teste): inclusão de
  um mês, exclusão e Desfazer, link da Previdência abrindo março/2025.

## Revisão visual (2026-10-08, sem commit)

Pedido do usuário depois de usar a área: cores "muito padrão", tabela "morta",
paddings ruins, o amarelo/laranja não convenceu e o salário bruto deveria ir
para as Entradas.

- **Paleta:** menta (a cor da marca) para o que entra e sobra e violeta para o
  que sai, no lugar do laranja; tokens `chart-saved` e `chart-spent` só de
  Recebimentos. A escolha veio da simulação de daltonismo registrada no
  [guia de estilos](../../docs/style-guide.md) (menta × violeta fica entre 41 e
  49 nos três tipos; menta × laranja cai a 16-18).
- **Cartões:** ícone, detalhe (média por mês, taxa de poupança, número de
  holerites) e brilho na cor do grupo; o Poupado leva a barra da taxa.
- **Gráfico:** barras com degradê, grade tracejada, legenda em selos e tooltip
  com entradas, gastos, poupado e taxa de poupança.
- **Tabela** (a partir de 1420 px; abaixo, blocos por mês): colunas por grupo,
  com o **Bruto dentro de Entradas**, em cinza e marcado "ref.", fora do total
  (o Total de Entradas continua sendo líquido + extras + VA/VR, como no Excel):
  - Entradas: Bruto · Líquido + extras · VA/VR · Total;
  - Saídas: Cartão · PIX · VA/VR · Total;
  - Resumo: Balanço, com a **taxa de poupança** (balanço ÷ entradas) em %
    e barra;
  - cabeçalhos de grupo com faixa colorida, colunas de total com fundo
    discreto, linhas de 44 px, ponto no mês atual e rodapé com **Total** e
    **Média** de cada coluna (média só dos meses com valor naquela coluna).
- **Blocos por mês** (abaixo de 1420 px): tira de cor, chip do saldo, entradas,
  saídas e bruto com marca do tom e a barra da taxa.
- Sem mudança de cálculo, modelo, backup ou dados; `savingsRatePercent` e as
  somas e médias do rodapé são funções puras com teste.
- Verificado no navegador (servidor de teste) em 320, 375, 430, 1024, 1280,
  1380, 1420 e 1440 px, sem rolagem lateral da página nem valores cortados.
