# 009 — Rótulo e valor de rebalanceamento

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

A tela de alocação (spec 008) mostra o percentual atual, a meta e a
diferença entre eles, mas o usuário ainda precisa interpretar manualmente se
cada linha está acima ou abaixo da meta e quanto em BRL isso representa. O
Excel resolve isso com um rótulo comprar/vender, documentado em
`excel-analysis.md`.

## Objetivo

Adicionar, a cada linha com meta definida na tela de alocação, um rótulo de
direção e o valor em BRL que aproximaria a posição da meta, sem sugerir
ativos específicos nem executar qualquer ordem.

## Regras

- a regra preserva o comportamento diagnosticado no Excel: a diferença é
  atual menos meta; valor positivo rotula "Vender", os demais casos,
  inclusive diferença zero, rotulam "Comprar";
- o valor em BRL é a diferença percentual aplicada ao denominador já usado
  pela linha (total atual da categoria ou, para classe/moeda/moeda
  geral/estratégia, o total da competência); representa o quanto a posição
  está distante da meta em BRL, não uma ordem de compra ou venda de um ativo
  específico;
- linhas sem meta cadastrada (já exibidas como "sem meta") não recebem
  rótulo nem valor;
- a tela permanece somente leitura: nenhum botão executa a sugestão.

## Fora do escopo

- escolha de qual ativo comprar ou vender dentro de uma categoria;
- execução de ordens ou integração de corretora;
- previdência;
- novas tabelas, normalizações ou achados.

## Critérios de aceite

- toda linha com meta definida mostra "Vender" quando a diferença percentual
  é positiva e "Comprar" nos demais casos, incluindo diferença zero;
- o valor em BRL de cada rótulo corresponde à diferença percentual aplicada
  ao mesmo denominador já usado para a linha;
- linhas sem meta continuam sem rótulo de direção;
- lint, tipos, build e testes de interface passam.

## Verificação

O rótulo e o valor foram calculados dentro de `toRow`, reaproveitando o
mesmo denominador já usado para o percentual atual de cada linha; nenhuma
nova consulta foi criada. Linhas sem meta continuam sem rótulo, incluindo a
competência de outubro de 2026 em rascunho conferida visualmente em desktop
e mobile. A linha "Reserva · USD", com diferença exatamente zero, recebeu o
rótulo "Comprar" e valor R$ 0,00, conforme a regra que trata zero como
"Comprar". `pnpm check`, `pnpm build` e `pnpm test:e2e` passaram sem
alterações na suíte existente.

## Referências

- [Tela de alocação](008-allocation-view.md)
- [Classificações e metas de alocação](007-allocation-data.md)
- [Diagnóstico do Excel](../context/excel-analysis.md)
