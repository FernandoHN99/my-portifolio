# 007 — Classificações e metas de alocação

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

A carteira normalizada ainda não preserva as classificações ponderadas de cada
posição nem as metas usadas pelo Excel. Sem esses dados, não é possível
reproduzir as análises de alocação e rebalanceamento.

## Objetivo

Normalizar as classificações mensais e importar as metas do Excel com origem
explícita, mantendo divergências como achados e preparando a cópia das
classificações para novos rascunhos.

## Classificações

- cada linha válida de `Table_Investimentos_Porcent` gera uma alocação vinculada
  à posição do mesmo mês;
- a alocação preserva classe, subclasse, duração e peso;
- uma posição pode ter várias alocações, cuja soma esperada é 100%;
- correspondências ambíguas por data e nome não escolhem uma instituição por
  ordem de linha e permanecem como achados;
- ao criar um novo rascunho, as alocações da posição de origem são copiadas
  pela identidade de conta e ativo;
- classificações copiadas não mantêm vínculo falso com uma linha do Excel.

## Metas

O plano inicial preserva os percentuais informados em:

- classe de ativos;
- moeda geral;
- estratégia;
- moeda dentro de cada classe;
- subclasse e duração de renda fixa;
- subclasse de renda variável.

Cada meta registra planilha e célula de origem. A meta geral de moeda e a
composição implícita das metas por classe e moeda permanecem independentes. A
diferença entre elas será registrada para decisão posterior.

## Cálculos posteriores

Percentuais atuais devem usar o total atual da respectiva categoria como
denominador. A aplicação não reproduzirá os denominadores ideais usados em
`Tables_Atual_Ideal!M80:M81` e `M88:M92`.

Esta spec não implementa a tela de alocação, edição das classificações, edição
das metas nem sugestões de rebalanceamento.

## Critérios de aceite

- normalização repetida não duplica alocações, metas ou achados;
- nenhuma correspondência ambígua escolhe automaticamente uma posição;
- alocações válidas mantêm a linha de origem;
- o rascunho atual e os futuros recebem as classificações do mês anterior;
- os seis conjuntos de metas reconciliam internamente conforme o Excel;
- a divergência entre metas de moeda fica visível na auditoria;
- migrações partem de um banco vazio e as verificações do projeto passam.

## Verificação

`pnpm normalize:allocations` vinculou 368 classificações de
`Table_Investimentos_Porcent` às posições normalizadas, deixou 15 achados
(13 posições ambíguas de Bitcoin e USDC por instituição, 1 duplicata exata
preservada na origem e a divergência esperada entre a meta geral de moeda e a
composição implícita por classe) e importou as 38 metas de
`Tables_Atual_Ideal`. Nenhuma das cinco combinações de escopo exato nem o
total por classe de moeda divergiu de 100%. Uma segunda execução produziu os
mesmos totais, sem duplicar alocações, metas ou achados.

O rascunho de outubro de 2026, já existente a partir da atualização mensal,
recebeu as classificações de setembro por identidade de conta e ativo; a
cópia não duplicou sobre uma nova execução do normalizador.

As migrações foram aplicadas do zero em um banco temporário no mesmo
PostgreSQL, sem tocar os dados locais, e removidas ao final. `pnpm check` e
`pnpm test:e2e` passaram sem alterações adicionais no código.

## Referências

- [Diagnóstico do Excel](../context/excel-analysis.md)
- [Domínio inicial da carteira](005-portfolio-domain.md)
- [Atualização mensal manual](003-manual-monthly-update.md)
