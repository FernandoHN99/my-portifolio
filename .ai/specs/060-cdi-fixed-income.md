# 060 — Renda fixa a percentual do CDI, cálculo bruto

Estado: implementada localmente em 2026-10-04 (sem deploy); a fonte oficial não
respondeu desta máquina, e a verificação usou taxas simuladas.
Definida em: 2026-10-04

## Problema

Seção 7 do [Prompt de continuidade](../context/position-transactions-prompt.md):
calcular automaticamente o saldo bruto de aplicações a percentual do CDI (como
105% do CDI), com a data de cada aporte e retirada, sem IR nem IOF, separando o
saldo acumulado da projeção futura e sem duplicar rendimento manual.

Só a modalidade a percentual do CDI entra nesta etapa; prefixado, IPCA e caixa
remunerado pela Selic ficam para quando o usuário definir.

## Modelo

- **ativo**: `cdi_percent` (como 105) e `applied_on` (o dia da aplicação de uma
  renda fixa nova);
- **posição de cada mês**: `calculation_start_date` (início do cálculo no mês;
  nulo desliga), `calculated_income_brl` (rendimento bruto do mês, que não vira
  transação), `income_calculated_through` (última taxa usada) e
  `income_calculation_error`;
- **taxas, de todos os usuários**: `rate_observations` (CDI diário, % ao dia) e
  `rate_coverage` (janelas conferidas na fonte; dentro delas, um dia útil sem
  taxa é feriado). Ficam fora do backup.

Migração `20261004210000_cdi_daily_valuation`; cálculo em
`src/modules/portfolio/domain/cdi-valuation.ts` (convenção da B3: início
inclusivo, fim exclusivo; decimais de 40 dígitos, arredondamento só no saldo).

## Comportamento

- **fonte**: série 12 do SGS do Banco Central
  (`api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados`), endereço do Portal de
  Dados Abertos. Gratuita e oficial, publicada no dia útil seguinte;
- **job** ([spec 053](053-scheduled-quote-sync.md)): a cada execução, mesmo sem
  cotação devida, busca o CDI que falta (no máximo a cada 3 horas) desde o
  início de cálculo mais antigo das posições do mês corrente e recalcula essas
  posições. O relatório da execução diz quantas taxas entraram, até quando e
  quantas posições foram recalculadas;
- **saldo bruto** = base do mês, rendendo desde o início do cálculo, mais cada
  movimentação rendendo desde o próprio dia; retiradas reduzem a base que segue
  rendendo. A avaliação vai até hoje, mas nunca passa do dia seguinte à última
  taxa conferida: sem saldo intraday nem taxa inventada;
- **sem taxa conferida**, o saldo conhecido é preservado e o motivo fica na
  posição;
- **renda fixa nova**: na inclusão, "Rentabilidade (% do CDI)" e "Dia da
  aplicação"; o valor vira "Valor aplicado" e o movimento inicial fica no dia da
  aplicação;
- **ativo antigo**: no lápis, "% do CDI" e "Calcular desde". A base é o saldo
  conhecido do mês; o início fica dentro da competência, para a base não render
  antes de existir. Nada da aplicação original é inventado;
- **desligar** guarda o rendimento já calculado como um rendimento registrado
  ("Rendimento bruto pelo CDI até …"), para o saldo não sumir;
- **sem duplicar**: numa posição calculada pelo CDI, o formulário de
  movimentação não oferece Rendimento; o cálculo automático não cria transações
  diárias;
- **meses independentes** ([spec 056](056-position-transactions.md)): na virada
  e no clone, o mês de origem fecha pelo CDI até o primeiro dia do mês novo, e
  esse fechamento vira a base dele, com o cálculo recomeçando no dia 1. Uma
  correção num mês passado não muda a base dos meses já criados;
- **página da posição**: o quadro "105% do CDI" mostra a base, o rendimento
  calculado, o saldo bruto e a última taxa usada; separada, a projeção no
  vencimento (ou em 12 meses) com a hipótese explícita: o último CDI diário
  mantido em todos os dias úteis, de segunda a sexta, sem feriados.

## Critérios de aceite

- aporte de hoje não rende desde a abertura de uma aplicação antiga;
- retirada reduz a base que segue rendendo;
- saldo bruto até a última taxa, separado da projeção;
- rendimento automático e manual não somados duas vezes;
- falta de taxa preserva o último valor válido, com o motivo;
- a virada herda o fechamento sem cascata.

## Verificação

Em 2026-10-04:

- `scripts/test-cdi-valuation.ts` (outra frente): datas de aportes e retirada,
  fim de semana, vencimento, cobertura e projeção, sem banco;
- num schema de teste (`tx056`), com taxas simuladas de 1% ao dia em 01/10 e
  02/10, chamando as funções do app:
  - R$ 1.000 aplicados a 100% do CDI em 01/10: sem taxa, ficaram R$ 1.000 e o
    motivo; depois do job, R$ 1.020,10, com R$ 20,10 de rendimento e a última
    taxa em 02/10;
  - aporte de R$ 500 em 02/10: R$ 1.525,10, porque o aporte rende só a partir do
    próprio dia;
  - a LCI BRB - Jun/27 (base R$ 6.191,37) a 90% do CDI desde 01/10: R$ 6.303,32;
    um início em setembro, com saldo herdado, foi recusado;
  - desligar guardou R$ 111,95 como rendimento registrado, e o saldo continuou
    R$ 6.303,32;
  - a virada para novembro herdou R$ 1.525,10 como base, com o cálculo desde
    01/11.

## Limitações

- **fonte inacessível daqui**: `api.bcb.gov.br` respondeu "domínio inexistente"
  (NXDOMAIN) nesta máquina, também pelo DNS do Google e pelo serviço de busca de
  páginas, em 2026-10-04, embora seja o endereço oficial documentado. A API
  Olinda do Banco Central (PTAX) responde. A integração fica pronta; falta
  confirmar a resposta real quando o endereço voltar a resolver;
- feriados não descontam dias úteis na projeção (hipótese declarada na tela);
- liquidez diária, carência e IR regressivo não fazem parte desta etapa.

## Referências

- [Prompt de continuidade](../context/position-transactions-prompt.md)
- [Descoberta: CDI e renda fixa](../context/next-adjustments-discovery.md)
- [Caderno de fórmulas da B3](https://www.b3.com.br/data/files/2C/84/37/A0/A394F6109A4874F6AC094EA8/Caderno%20de%20Formulas%20-%20CDBs-DIs-DPGE-LAM-LC-LF-LFS-LFSC-LFSN-IECI-RDB.pdf)
