# 015 — Transições sem recarregamento

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

O usuário comparou duas experiências do próprio app. Alternar o empilhamento
do gráfico de evolução parece imediato, porque acontece no cliente. Já trocar
a competência ou deslizar entre abas dá sensação de recarregamento, porque
cada troca busca dados no servidor e a tela é substituída enquanto isso.

## Objetivo

Fazer a troca de competência e de aba parecer contínua, preservando a tela
anterior durante a busca e sinalizando o carregamento de forma discreta, sem
abrir mão de buscar os dados no servidor.

## Escopo

- a troca de competência ocorre dentro de uma transição do React, de modo que
  o conteúdo atual permaneça visível até o novo chegar;
- durante a transição, um indicador discreto mostra que há atualização em
  curso, sem substituir a tela por um estado vazio;
- a troca de aba preserva o cabeçalho e a linha do tempo, animando apenas o
  conteúdo;
- o estado de carregamento global não deve esvaziar a página inteira;
- a animação de entrada do conteúdo não pode reiniciar a cada movimento do
  seletor, para não parecer um recarregamento;
- o comportamento respeita `prefers-reduced-motion`.

## Fora do escopo

- buscar todas as competências de uma vez no cliente;
- qualquer mudança nas regras financeiras.

## Critérios de aceite

- ao trocar a competência, o conteúdo anterior permanece visível até o novo
  estar pronto;
- existe sinal visível de carregamento durante a transição;
- nenhuma tela pisca em branco ao trocar de competência ou de aba;
- lint, tipos, build e testes de interface passam.

## Causa encontrada

O projeto tinha um `loading.tsx` na raiz do App Router. Como fallback de
Suspense da rota inteira, ele substituía a página inteira, incluindo o
cabeçalho e a linha do tempo, a cada navegação para uma rota dinâmica. Era
isso que produzia a sensação de recarregamento. O arquivo ainda desenhava a
barra lateral já removida. Foi excluído.

Além disso, a animação de entrada do conteúdo usava a competência na sua
chave, de modo que todo movimento do seletor remontava o conteúdo e repetia
a animação. A chave passou a considerar apenas a rota.

## Verificação

A troca de competência passou a ocorrer dentro de uma transição do React,
com a mesma abordagem no seletor e no clique sobre a coluna do gráfico. O
conteúdo anterior permanece na tela durante a busca e uma barra fina abaixo
do cabeçalho indica o carregamento, com aviso equivalente para leitores de
tela. Ao concluir, apenas os números animam até o novo valor.

Conferido ao navegar entre competências sucessivas: nenhuma tela em branco e
nenhum esqueleto. Março de 2026 apresentou R$ 199.651, igual à planilha.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Navegação no topo e seletor global de mês](010-global-shell-month-selector.md)
