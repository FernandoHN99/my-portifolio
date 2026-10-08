# 089 — Previdência: limite de 12% do PGBL por ano-base

Estado: implementada e conferida localmente em 2026-10-07; publicação junto com
as specs 088 a 092.
Origem: pedido do usuário em 2026-10-07 ("só me ajudar no cálculo"), com as
tabelas de aportes e de meses trabalhados da aba Previdência do Excel.

## Decisões

- **Área por concessão:** módulo `PENSION` em Finanças, só para
  `nandohneto@gmail.com` (migração `20261008090100_income_tables` ou
  `pnpm auth:access grant <e-mail> previdencia`). Página `/previdencia`, só
  leitura; sem a concessão, 404.
- **Cálculo por ano-base**, como o filtro "Ano Base" da planilha (célula
  "12% Renda Tributável" e "Investimento Pendente"):
  - renda tributável = soma da renda das linhas de holerite cujo início cai no
    ano (`YEAR([Data Inicial])`), sem 13º salário e PLR;
  - limite = 12% da renda tributável, arredondado aos centavos;
  - aportado = soma dos aportes do ano; falta aportar = limite − aportado, ou
    "Acima do limite" quando negativo.
- **Aportes vêm da carteira:** movimentações `OPENING` (saldo inicial, que é a
  primeira parcela pela spec 071) e `CONTRIBUTION`, sem `transferId`, nas
  posições cujo ativo é Previdência por `assetTypeOf` (tipo `pension`, ou o
  nome nos ativos antigos sem tipo). Todas as previdências entram, como
  pediu o usuário; cada linha leva à página da posição.
- **Meses trabalhados vêm de Recebimentos** (spec 088), em tabela no
  computador (Nome, Início, Fim, Empresa, Dias, Proporcional, Bruto, Por dia,
  Renda tributável) e em lista no celular; cada linha abre o mês em
  Recebimentos para editar.
- Cores pelo [guia de estilos](../../docs/style-guide.md): o que conta a favor
  do limite em menta (`primary`) e o que passa dele em violeta (revisão visual
  abaixo; a primeira versão usava o tom de atenção).

## Conferência

- O backup de produção de 2026-10-07 22:37 confere com a lista do usuário: os
  sete aportes da Grão FIM somam R$ 24.380. O primeiro está gravado como saldo
  inicial em 01/09/2025, com a nota "aplicação de 08/08/2025"; o ano é o mesmo.
  O usuário restaurou esse backup na conta local em 2026-10-07 (41
  competências, 494 posições, 318 movimentações, Out/26 R$ 267.773,31).
- **2025:** renda R$ 103.150,50, limite R$ 12.378,06, aportado R$ 12.380,00 —
  R$ 1,94 acima do limite.
- **2026** (holerites até setembro, com as duas linhas de setembro):
  renda R$ 115.173,70, limite R$ 13.820,84, aportado R$ 12.000,00 — faltam
  R$ 1.820,84. Os dois anos somam R$ 218.324,20, o total da tabela colada.
- Ver o ponto aberto das férias de setembro na [spec 088](088-income-ledger.md).

## Fora do escopo

- Projeção até dezembro, distinção PGBL/VGBL por plano e saldo das
  previdências na página: não pedidos; ficam para quando o usuário quiser.

## Verificação

`tests/unit/pension.test.ts` (2025, 2026, total e 13º/PLR), o teste de
integração da spec 088 (aportes só de previdência, sem transferências e só do
próprio usuário) e `tests/e2e/pension.spec.ts`.

## Revisão visual (2026-10-08, na `dev`, sem push nem publicação)

Pedido do usuário depois de revisar Recebimentos: a Previdência "toda branca" e
sem o mesmo cuidado. Mesma linguagem de Recebimentos
([spec 088](088-income-ledger.md)) e peças compartilhadas em
`src/components/product/finance-parts.tsx` (tons menta e violeta, barra de taxa
e cartão de resumo).

- **Cartões:** ícone, brilho e detalhe (holerites no cálculo, % do limite);
  Aportado e Falta aportar em menta; **Acima do limite em violeta**, com a
  borda destacada também violeta. Sem holerites no ano, "Falta aportar" mostra
  R$ 0,00 e o detalhe "sem holerites no ano", em vez de chamar tudo de excesso.
- **Uso do limite** (painel novo): uma barra com um trecho menta por aporte, na
  ordem em que entraram (cada trecho com a data e o valor no `title`), o
  percentual grande ao lado, a marca do limite quando há excesso, e o que passa
  do limite em violeta. A escala vai até o maior entre o limite e o aportado.
  Legenda com Aportado e Livre, ou Aportado e Acima do limite. Sem holerites,
  o painel leva a Recebimentos.
- **Aportes** (tabela a partir de 1280 px; abaixo, cartões): Nº, Data, Plano,
  Tipo (Saldo inicial ou Aporte, em selo), Valor e **Acumulado**, com a
  porcentagem do limite e a barra de cada aporte. Total no rodapé com o uso do
  limite; a linha abre a posição.
- **Meses trabalhados:** Nome em selo, **Período** (início → fim) em vez de duas
  colunas, Empresa, Dias, Proporcional, Bruto, Por dia e Renda tributável em
  coluna tingida; as linhas não tributáveis (13º e PLR por padrão) esmaecidas,
  "não tributável". O rodapé mostra a
  conta inteira: renda tributável e, abaixo, "× 12% = limite do ano". Datas em
  dd/mm/aa, como a planilha dele.
- **Regras novas, puras e testadas:** acumulado e % do limite de cada aporte,
  `limitUsagePercent` e `usageSegments` (o trecho acima do limite, como os R$
  1,94 de 2025). Sem mudança de cálculo, modelo, backup ou dados.
- Verificado no navegador (servidor de teste) em 320, 375, 430, 1024, 1280 e
  1440 px, sem rolagem lateral nem texto cortado, e nos dois anos: 2026 (87% do
  limite) e 2025 (100%, R$ 1,94 acima).

