# 019 — Modo de edição com lápis

Estado: concluída em 2026-10-02
Definida em: 2026-10-02

## Problema

A [spec 017](017-positions-editing.md) abria a edição de uma célula por vez
com duplo clique. O usuário não gostou do gesto, e no celular a coluna de
quantidade ficava oculta, sem edição. A decisão está registrada em
[Reestruturação da UX](../context/ux-restructure.md), em "Edição: lápis em
vez de duplo clique".

## Objetivo

Um botão de lápis coloca as posições da competência em modo de edição, com
todos os campos editáveis ao mesmo tempo, inclusive no celular.

## Comportamento

- fora do modo de edição a tabela é somente leitura: sem campos, sem coluna
  de ações, sem "Adicionar posição" e com as cotações do mês bloqueadas;
- "Editar posições", com o ícone de lápis, fica no cabeçalho da aba;
- na competência mais recente o lápis entra direto no modo de edição; em
  competência passada abre a confirmação de que o histórico será alterado,
  como antes;
- no modo de edição, quantidade ou saldo e estratégia viram campos em todas
  as linhas; Enter e as setas para cima e para baixo passam para a linha
  seguinte ou anterior do mesmo campo;
- o total e a participação são recalculados enquanto se digita; um valor
  inválido fica marcado, é contado na barra inferior e bloqueia o
  salvamento, em vez de ser descartado em silêncio;
- a barra inferior fica visível durante todo o modo de edição, com a
  contagem de alterações, "Descartar" ou "Sair da edição" e "Salvar";
- salvar grava tudo em uma única transação, sai do modo de edição e mostra o
  aviso de confirmação com a opção de desfazer;
- descartar limpa as alterações e sai do modo de edição;
- trocar de competência sai do modo de edição;
- no celular, o modo de edição mostra a coluna de quantidade; a estratégia
  aparece a partir de telas pequenas e a tabela rola na horizontal para
  alcançar as ações.

## Decisões tomadas

- a frase do usuário "ao confirmar, a mensagem de confirmação continua
  aparecendo" foi entendida como manter os dois avisos existentes: a
  confirmação de histórico ao entrar em edição numa competência passada e o
  aviso de alterações salvas, com desfazer, depois de gravar;
- o servidor, as ações e a regra de confirmação de histórico da spec 017 não
  mudaram; a mudança é só de interface;
- rateio, inclusão, remoção e cotações do mês também exigem o modo de
  edição, para que a tabela fora dele seja apenas consulta. As cotações
  saíram da tabela para uma página com modo de edição próprio, na
  [spec 022](022-quotes-page.md);
- os campos mostram o valor com vírgula decimal, como o resto da interface.

## Fora do escopo

- criar ativos e contas novos;
- folha de edição própria para celular.

## Critérios de aceite

- não existe mais edição por duplo clique;
- o lápis coloca todas as posições visíveis em edição de uma vez;
- competência passada pede confirmação antes de entrar em edição;
- valor inválido bloqueia o salvamento;
- a edição funciona no celular;
- lint, tipos, build e testes de interface passam.

## Verificação

Num banco local criado pelas migrações e carregado com a importação do
Excel, o lápis em setembro de 2026 abriu os campos de todas as posições;
alterar a quantidade do Bitcoin 01 para 0,5 mostrou R$ 197.523,00, salvar
gravou 0,5 no banco, saiu do modo de edição e mostrou "Alterações salvas"
com "Desfazer".

Os cenários do Playwright não gravam nada: um entra em edição, altera um
valor, confere a contagem pendente, digita um valor inválido, confere o
bloqueio e descarta; o outro confere a trava de agosto, cancela a
confirmação, confirma, vê os campos e sai da edição. A edição deixou de ser
pulada no perfil de celular, e a suíte passou com os 20 cenários.
`pnpm check` e `pnpm build` passaram.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Posições: edição](017-positions-editing.md)
