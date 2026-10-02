# 014 — Configuração da carteira

Estado: concluída em 2026-10-02
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
dependência precisa deixar de ser obrigatória antes da edição existir. As
metas são globais e valem para todos os meses; o histórico de versões serve
apenas para registrar quando elas mudaram.

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

## Decisões tomadas

- cada salvamento cria uma nova versão do plano e a torna a única vigente; as
  anteriores, inclusive a importada do Excel, ficam guardadas e listadas com a
  data como registro de mudanças. As metas são globais, por esclarecimento do
  usuário em 2026-10-02: toda competência, inclusive as passadas, é calculada
  com a versão vigente;
- o plano importado continua ligado ao lote; os planos do usuário não têm
  lote, e por isso a dependência passou a ser opcional na migração
  `editable_target_plans`;
- uma meta salva mantém a planilha e a célula de origem somente quando o
  valor é igual ao importado para a mesma categoria; alterada, a origem fica
  vazia, para não atribuir ao Excel um número que ele não tinha;
- "Restaurar padrão do Excel" preenche o rascunho com os valores importados,
  sem gravar; o usuário vê a prévia e salva como qualquer outra edição;
- a moeda dentro de cada classe soma 100% por classe; os demais grupos somam
  100% no conjunto; a matriz de renda fixa soma 100% nas seis células;
- o servidor revalida categorias, somas e limites antes de gravar, e recusa
  um plano idêntico ao vigente;
- o cálculo de rebalanceamento saiu da consulta e passou a ser uma função
  pura de domínio, `buildAllocationGroups`, usada pela Visão Geral no servidor
  e pela prévia no navegador; a Visão Geral manteve os mesmos números
  conferidos com o Excel;
- o normalizador do Excel não reativa mais o plano importado quando o usuário
  já tem uma versão vigente;
- a configuração ganhou o seletor de competência, que define o mês usado na
  prévia.

## Limites conhecidos

- não é possível criar nem remover categorias, somente alterar percentuais;
- abaixo da largura de desktop a prévia aparece depois dos grupos, não ao
  lado;
- não há desfazer em aviso; voltar a uma meta anterior é feito editando de
  novo ou restaurando o padrão, e o histórico registra cada versão.

## Verificação

As gravações foram verificadas em um banco temporário, criado pelas migrações
e carregado com a importação do Excel, removido ao final. Dez verificações de
domínio passaram: plano idêntico, classe com 105%, moeda do caixa com 90%,
categorias faltando e percentual acima de 100 recusados; nova versão vigente
com o plano do Excel preservado e desativado; 36 de 38 metas mantendo a origem
quando duas foram alteradas; e o ideal de renda fixa passando de R$ 63.049,23
para R$ 75.659,08 com a meta de 30%, com IPCA curto encadeando pelo novo ideal.

Pela interface, no mesmo banco temporário, alterar caixa para 20% mostrou
"Soma: 105% · sobram 5%", bloqueou o salvamento e levou a prévia a comprar
R$ 11.046,32; zerar a reserva fechou a soma. "Restaurar padrão do Excel"
seguido de salvar criou uma versão com as 38 metas recuperando a origem, e a
Visão Geral voltou aos valores conferidos com a planilha.

Achado operacional: no Prisma 7, `prisma migrate dev` não regenera o cliente;
é preciso rodar `pnpm db:generate`. Além disso, um `next dev` iniciado antes
da migração mantém o cliente antigo em memória e precisa ser reiniciado. Com
o servidor de desenvolvimento antigo, a configuração caía no estado vazio.
A suíte completa do Playwright, rodada contra um servidor novo sobre os dados
locais, passou com 17 cenários e um pulado intencionalmente. Os cenários não
gravam nada. `pnpm check` e `pnpm build` passaram.

## Referências

- [Reestruturação da UX](../context/ux-restructure.md)
- [Classificações e metas de alocação](007-allocation-data.md)
- [Rebalanceamento na Visão Geral](012-rebalancing-in-overview.md)
