# 017 — Posições: edição

Estado: planejada
Definida em: 2026-10-01

Separada da spec 013 para manter as fatias pequenas. Parte da tabela com
filtros entregue lá: o usuário filtra um recorte e edita dentro dele.

O usuário registrou em 2026-10-01 que editar posições e metas é necessário,
sem fixar se agora ou depois.

## Problema

A edição vive em uma rota separada, restrita ao rascunho, e só altera
quantidade e saldo. O usuário quer editar qualquer competência com a
facilidade da planilha, e editar deve ser o comportamento natural da aba.

## Escopo

- edição direta na célula, com navegação por teclado;
- a competência mais recente é editada sem cerimônia;
- competências passadas ficam travadas e exigem confirmação explícita, com
  aviso de que o histórico será alterado;
- alterações ficam pendentes e destacadas até salvar ou descartar;
- inclusão e remoção de posição;
- ao salvar, um aviso permite desfazer;
- rateio da posição editado em painel lateral, com validação de soma igual a
  100%;
- criar a competência a partir da anterior, clonando posições e rateios, sem
  depender da busca de cotações;
- painel recolhível com as cotações da competência, editáveis, com recálculo
  dos totais das posições cotadas.

## Mudança de regra

A spec 006 restringiu a edição ao rascunho. O briefing do usuário permite
editar competências passadas mediante confirmação, porque após a importação o
aplicativo é a fonte da verdade. A regra de domínio deve mudar de "somente
rascunho" para "rascunho livre, demais com confirmação explícita".

A rota `/carteira/editar` deixa de ser necessária quando esta fatia existir.

## Critérios de aceite

- editar uma quantidade recalcula o total pela cotação persistida;
- editar um saldo manual atualiza quantidade e total na mesma transação;
- competências passadas só aceitam alteração após confirmação;
- nenhum conjunto inválido é salvo parcialmente;
- o rateio recusa soma diferente de 100%;
- clonar a competência anterior traz posições e rateios;
- alterar uma cotação recalcula as posições daquele símbolo na competência;
- lint, tipos, build e testes de interface passam.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições: filtros e consulta](013-positions-filters.md)
- [Edição das posições do rascunho](006-draft-position-editing.md)
- [Classificações e metas de alocação](007-allocation-data.md)
