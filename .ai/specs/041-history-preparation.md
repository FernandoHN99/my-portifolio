# 041 — Histórico completo para a importação (passo pré-produção)

Estado: concluída em 2026-10-03. O modo automático do agente bloqueou o
`--apply` no schema `public`; o usuário rodou a importação no banco local.
Os roteiros e os arquivos desta spec saíram do repositório na
[spec 047](047-json-only-data.md); ficam no commit `82b502b`.
Definida em: 2026-10-03

## Problema

Pedido do usuário em 2026-10-03, ao iniciar o
[passo pré-produção](../context/pre-deploy.md): a partir de dois CSVs
exportados da planilha (`02-INVESTIMENTOS_MAIN` e `03-INVESTIMENTOS_PORCENT`,
sem a tabela de cotações), montar um arquivo completo para importar direto no
banco, com cotações, relacionamentos e todas as colunas do modelo. Regras
ditas por ele:

- buscar cada cotação nas APIs ou em fonte fidedigna; não inventar dados;
- meses inexistentes recebem todas as posições do mês anterior mais próximo;
- cotação de fechamento do último dia de cada mês, sem lacunas;
- identificar o mesmo ativo cadastrado de formas diferentes, para o rastreio
  da posição; na dúvida, perguntar, sem assumir nada sem 100% de certeza;
- dúvidas de colunas também são perguntadas;
- os roteiros antigos de importação do Excel (`scripts/import-excel.ts`,
  `normalize-portfolio.ts`, `normalize-allocations.ts`) ficam no repositório,
  mas não são usados neste passo.

Os dois CSVs são idênticos às tabelas do `raw_file/01-Investimentos.xlsm`
(conferido célula a célula com as linhas da importação antiga).

## Arquivos e comandos

| Caminho | Conteúdo |
|---|---|
| `data/history/source/` | os dois CSVs do usuário, sem alteração |
| `data/history/raw/` | respostas brutas dos provedores, para montar sem rede e auditar |
| `scripts/history/decisions.ts` | cada unificação, correção e classificação, ligada à pergunta (A1–A9, P1–P23) e à resposta |
| `data/history/output/` | os CSVs para importação (`;` e vírgula decimal, como a planilha) |

- `pnpm history:fetch`: baixa PTAX, Yahoo Finance, Binance e Alpha Vantage;
- `pnpm history:build`: monta os CSVs e lista avisos e respostas pendentes;
- `pnpm history:import`: só confere e simula; `-- --apply` grava.

Arquivos de saída:

- `ativos.csv`: chave no formato de `buildAssetKey`, nome, ticker, moeda base,
  tipo, liquidez, vencimento, primeiro e último mês;
- `posicoes.csv`: competência, instituição, conta "Principal", ativo,
  quantidade, cotação e dólar do mês, total, estratégia, origem (linha da
  planilha ou "copiado de"), observações das correções e os valores da
  planilha lado a lado;
- `rateios.csv`: classe, subclasse, resgate e peso de cada posição;
- `cotacoes.csv`: fechamento de cada símbolo em cada mês, dia, moeda original,
  dólar usado, provedor, conferência numa segunda fonte e a diferença; o
  destino é a competência (símbolos com posição no mês) ou só o histórico
  diário (os demais meses, para o gráfico de cotação, como na spec 029);
  `repetida_de` marca as cotações de out/26, repetidas de set/26;
- `meses.csv`: total de cada competência ao lado do total da planilha.

Resultado: 41 competências (jun/23 a out/26), 9 instituições, 49 ativos, 457
posições, 487 linhas de rateio, 216 cotações mensais e 247 fechamentos para o
histórico diário.

## Regras aplicadas

- **Competências**: jun/23 a set/26 da planilha, sem lacunas. Ago/23, set/23,
  nov/23, jul/24 e fev a jun/25 repetem as posições do mês anterior; os saldos
  em reais são copiados e os ativos cotados usam o fechamento do mês.
- **Out/26** (P17): o usuário disse que ainda não mexeu em outubro; o mês
  aberto repete as posições de set/26, com as cotações de set/26 marcadas como
  repetidas, como a virada de mês sem histórico diário. A atualização ao abrir
  reprecifica o mês. Os valores que estavam no out/26 do banco (por exemplo LCD
  BDMG 6.540,93, LCD BNDES 12.515,48, LCI BRB - Jun/27 6.251,93, Solana 6,1848)
  saem com ele; a origem deles não é conhecida.
- **Cotações** (fechamento do mês):
  - dólar: PTAX de venda do último dia útil (Banco Central); conferência no
    BRL=X do Yahoo, a até 1,07%;
  - BTC, SOL e ETH: vela mensal da Binance no par em reais, fechada às 23h59
    UTC do último dia; conferência no par em USDT × PTAX, a até 2,18%;
  - ETFs dos EUA: fechamento do último pregão no Yahoo × PTAX do mês;
    conferência no Alpha Vantage, igual (até 0,01%) em todos os meses usados;
  - GPCA11: fechamento do último pregão no Yahoo (GPCA11.SA), igual ao Alpha
    Vantage;
  - o XLE teve desdobramento de 2 para 1 em 2025-12-05; os meses anteriores
    ficam de fora porque as posições começam em abr/26.
- **Totais**: ativos cotados valem quantidade × fechamento; saldos em reais,
  o valor da planilha. A coluna "Cotação Dolar" vira o dólar do mês.
- **Banco**: a importação substitui instituições, contas, ativos,
  competências, posições, rateios e cotações mensais; preserva metas, lotes da
  importação do Excel (as metas importadas dependem deles), histórico diário e
  execuções de atualização, que voltam a apontar para a competência do dia.
  Apaga `monthly_update_runs`, do fluxo antigo "Atualizar carteira", que o
  usuário liberou em 2026-10-02.

## Achados

- A planilha registrava as cotações em dias variados, em geral no começo do
  mês: o dólar de set/26 era 5,1084, e a PTAX de 30/09/26 é 5,1809. Com o
  fechamento do mês, os totais mudam; os maiores efeitos são ago/26 (+12,0%,
  BTC de 329.479 para 408.710), fev/24 (+9,6%), nov/25 (−9,8%) e jan/26
  (−7,5%). A tabela completa está em `meses.csv`.
- Solana em set/25: a planilha usou 206,47, o preço em dólar, como se fosse em
  reais; o total era R$ 1.145,77 e passa a ~R$ 6.170.
- "LCI XP" e "LCI - XP" geram a mesma chave de ativo (`private:xp:lci-xp`).
  Como o usuário disse que são títulos diferentes (P8), o de jan/25 se chama
  "LCI - XP (2025)"; ele pode renomear pelo lápis (spec 040).
- ETFs em dólar: dividir o valor em US$ pelo preço do começo do mês reproduz a
  quantidade conhecida depois (VOO 1,74155, ARGT 6,09534, GLDM 13,87541817);
  pelo fechamento do mês, o VOO iria de 1,69 a 1,78 cotas.

## Perguntas e respostas (2026-10-03)

**Unificações de alta confiança (A)**, apresentadas em bloco. O usuário só
contestou a A4 e condicionou a A7 aos valores:

- A1. "Banco Inter" é a "Inter". Confirmada.
- A2. "Carteira Cripto" é a "Ledger" (o Bitcoin 01 alterna entre as duas com a
  mesma quantidade). Confirmada.
- A3. "Bitcoin" na Ledger e na Carteira Cripto é o Bitcoin 01; na Binance, o
  Bitcoin 02. Confirmada.
- A4. "C6 - CDB Diario 105%" e "C6 - CDB Cartao 100%" seriam os CDBs sem o
  prefixo. Resposta: "são diferentes mesmo, provável, porém ambos do banco
  C6". Ficam separados.
- A5. "Dolar" é o "Dólar". Confirmada.
- A6. "Tesouro Renda+ 2065" é o "Tesouro IPCA Renda+ 2065". Confirmada.
- A7. "LCI BRB" é a "LCI BRB - Set/26", se os valores baterem ("é uma única
  lapada o investimento"). Batem: 9.594,66, 9.651,92, 9.776,38, 9.869,83,
  9.984,53 e 10.093,00, de abr a set/26. Unificadas.
- A8. As linhas RV 54% e RF 46% da previdência (jan–jun/26) são uma posição só,
  com rateio 54/46. Confirmada.
- A9. ETFs e criptos em dólar são os ativos com ticker. Confirmada.

**Identidade:**

- P1. "Previdência - Grão FIM" é a mesma previdência? "Sim, só tive uma única
  previdência até hoje." Um ativo só, com o nome mais recente.
- P2. "Conta Global", "Dolar Inter" e o "Dólar" de 2023–24 são o mesmo saldo da
  Inter? Sim. Um ativo só, "Dolar Inter".
- P3. USDC da Chainless é o da AAVE? "Sim, na época acabei migrando de um para
  o outro." A Chainless vira AAVE.
- P4. "C6- Parado" é a "Conta Bancária" do C6? "Considere esses casos como
  conta corrente." Unificados.
- P5. "CDB - 110%" é um CDB do C6 de out/23? "Você define pelo valor." Não
  bate (20.277 em jul/23 contra 975 e 2.500): separado.
- P6. "Liquidez Diaria" é o "Picpay - Confrinho"? "Acredito que não, mas
  cheque." Não bate (4.238 em jul/23, 1.612 em jul/25): separado.
- P7. "Inter" (out/23) é o "Porquinho"? **Sem resposta**; fica separado.
- P8. "LCI XP" e "LCI - XP" são o mesmo? "Acredito que não." Separados.

**Quantidades e valores:**

- P9. Bitcoin de jun/23: 0,179195, a de jul/23. Confirmada.
- P10. Jan/24 com as quantidades precisas de BTC. Confirmada.
- P11. Cotas conhecidas depois nos meses em dólar (VOO, ARGT, GLDM). Confirmada.
- P12. VTI, Ethereum e Solana de 2024: "não sei as quantidades"; valor em US$
  ÷ fechamento do mês.
- P13. Duplicatas de set/25 descartadas. Confirmada.
- P14. Bitcoin 02 ausente em mar/24. Confirmada.
- P15. Time Deposit e Dolar Inter ausentes em jun/26. Confirmada.
- P16. Cotas precisas de out/26 aplicadas aos meses com o mesmo número
  arredondado (VOO, IAUM, SIVR, VXUS). Confirmada; a diferença é de centavos.
- P17. Out/26 inteiro descartado e copiado de set/26 (ver "Regras aplicadas").

**Colunas e classificação:**

- P18. Classificação de cada ativo padronizada pela mais recente, em todos os
  meses; previdência e GPCA11 mantêm o rateio de cada mês. Confirmada.
- P19. D+0 e D+1 saem do resgate (viram Curto) e vão para a liquidez do
  ativo. Confirmada.
- P20. Subclasse "Curto" do caixa vira Pós-fixado. Confirmada.
- P21. Vencimentos: "não vamos nos preocupar com posições antigas; quando eu
  mexer em outubro eu coloco." Nenhum vencimento.
- P22. Dólar pela PTAX de venda. Confirmada.
- P23. "Etherium" vira "Ethereum". Confirmada.

## Verificação

- cotações: as 453 dos meses da planilha conferidas numa segunda fonte; as 10
  de out/26 repetem set/26;
- schema `teste_backup` ([spec 042](042-data-backup.md)): backup do banco real
  restaurado e `pnpm history:import -- --apply` por cima, com 41 competências e
  457 posições, totais iguais aos de `meses.csv`, metas e lotes preservados;
  a segunda execução deu o mesmo resultado;
- navegador, servidor do schema de teste na porta 3100: Visão Geral com
  R$ 264.761 em out/26, mar/25 (mês preenchido) com 10 posições, página do
  Bitcoin 01 com 40 de 40 competências desde jun/23 e a cotação de fechamento
  de todos os meses;
- Playwright contra esse servidor (`E2E_BASE_URL`): 151 passaram, 11 pulados.
  Oito testes que fixavam valores e lacunas do histórico antigo foram
  reescritos para o novo (preços de fechamento, Bitcoin 01 numa conta só, USDC
  em Binance e AAVE para "Todas as contas", Bitcoin 02 ausente em mar/24,
  LCI BRB - Set/26, LINK no lugar do ETH, subclasses do caixa). O cenário do
  prazo fora do padrão fica pulado: o histórico novo não tem renda fixa sem
  prazo;
- banco local, depois da importação feita pelo usuário: 41 competências, 457
  posições e 49 ativos; out/26 já reprecificado pela atualização ao abrir; a
  suíte do Playwright passou (151, com 11 pulados).

Os backups do banco anterior à importação ficam em `backups/` (fora do Git) e
podem ser restaurados pela Configuração ([spec 042](042-data-backup.md)).

## Em aberto

- P7: "Inter" (out/23, R$ 5.573,41) e "Porquinho" seguem como ativos
  separados até o usuário responder.
