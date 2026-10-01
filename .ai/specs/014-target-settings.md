# 014 — Configuração da carteira

Estado: planejada
Definida em: 2026-10-01

## Problema

As metas vieram da planilha e só podem ser consultadas. O usuário quer
definir o cenário ideal dentro do app e ver o efeito nas ações de comprar e
vender antes de confirmar.

## Objetivo

Permitir editar as metas por grupo, com validação de soma e prévia ao vivo
do rebalanceamento resultante.

## Grupos

Os seis grupos já normalizados: classe de ativos, moeda global, estratégia,
moeda dentro de cada classe, matriz de subclasse e duração da renda fixa, e
subclasses da renda variável. Os percentuais importados do Excel servem como
valor inicial.

## Interface

- campo numérico com deslizante por item e barra empilhada do grupo;
- indicador por grupo informando se a soma fecha 100%;
- salvar fica indisponível enquanto algum grupo divergir de 100%;
- prévia ao vivo da tabela de comprar e vender da competência selecionada,
  comparando o resultado atual com o resultado das metas em edição;
- salvar, descartar e restaurar o padrão.

## Implicação no modelo

O plano de metas atual depende de um lote de importação e é único por lote.
Um plano editado pelo usuário não nasce de uma importação, então essa
dependência precisa deixar de ser obrigatória antes da edição existir. O
histórico de versões das metas é desejável para saber qual meta valia em cada
época, e será avaliado nesta fatia.

## Fora do escopo

- Previdência;
- execução de ordens.

## Critérios de aceite

- nenhum grupo pode ser salvo com soma diferente de 100%;
- a prévia usa a competência selecionada e mostra o antes e o depois;
- descartar restaura os valores persistidos;
- as metas salvas passam a valer em todas as telas de alocação;
- a origem na planilha permanece registrada para as metas importadas;
- lint, tipos, build e testes de interface passam.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Classificações e metas de alocação](007-allocation-data.md)
- [Aba de alocação com sub-abas](012-allocation-tabs.md)
