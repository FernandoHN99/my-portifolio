# 008 — Tela de alocação

Estado: concluída em 2026-10-01
Definida em: 2026-10-01

## Problema

As classificações por posição e as metas do plano ativo já estão normalizadas
(spec 007), mas só existem no banco. O usuário não tem como consultar sua
alocação atual nem compará-la com a meta sem acessar o banco diretamente.

## Objetivo

Apresentar, para a competência mais recente, a alocação atual ao lado da meta
vigente, nas mesmas seis famílias normalizadas pela spec 007, sem calcular
sugestão de rebalanceamento nem permitir edição.

## Escopo

- nova rota `/alocacao` e item correspondente na navegação do app shell;
- leitura da competência mais recente, pelo mesmo critério da visão geral
  (inclui rascunho quando existir);
- seis agrupamentos: classe de ativos, moeda geral, estratégia, moeda dentro
  de cada classe, subclasse/duração de renda fixa e subclasse de renda
  variável;
- o percentual atual de cada categoria usa o total atual da própria
  categoria como denominador, conforme decisão já registrada na spec 007;
  não reproduz os denominadores ideais do Excel;
- posições sem classificação aparecem agregadas como "sem classificação" em
  cada família afetada, em vez de ficarem ausentes do total;
- cada linha mostra valor atual em BRL, percentual atual, percentual-meta e a
  diferença entre eles, sem rótulo de ação;
- ausência de plano de metas ativo ou de classificações para a competência é
  informada na tela, sem erro.

## Fora do escopo

- edição de classificações ou de metas;
- sugestão ou rótulo de rebalanceamento (comprar/vender);
- previdência;
- novas tabelas, normalizações ou achados (reaproveita os dados da spec 007).

## Interface

- cartão de contexto com a competência exibida e seu estado (rascunho ou
  importada);
- um bloco por família de meta, comparando atual e ideal;
- aviso textual quando houver posições sem classificação, sem listar cada
  achado individualmente; a lista completa permanece na revisão de
  importação;
- tema escuro consistente com as demais telas, sem elementos decorativos.

## Critérios de aceite

- a tela usa somente os dados normalizados por `PositionAllocation` e
  `AllocationTarget`, sem recalcular metas;
- a soma dos percentuais atuais de cada família aproxima 100% quando todas
  as posições da competência estão classificadas;
- posições sem classificação ficam visíveis como categoria própria em vez de
  ocultas ou distribuídas entre as demais;
- a tela funciona tanto para uma competência em rascunho quanto para uma
  competência importada;
- lint, tipos, build e testes de interface passam.

## Verificação

A consulta lê a competência de maior `referenceDate` (mesmo critério da visão
geral) e o plano de metas com `isActive`. Classe de ativos e suas famílias
aninhadas (moeda por classe, subclasse/prazo de renda fixa, subclasse de
renda variável) somam o `totalBrl` de cada posição ponderado pelo peso de
cada alocação; moeda geral e estratégia somam o `totalBrl` integral das
posições, por serem atributos da própria posição, não da classificação.

Uma primeira versão combinava rótulo primário e secundário concatenando-os em
uma única chave de texto separada por `:`. O rótulo "Ações - Ex: USA" contém
esse caractere, o que quebrou o vínculo com sua meta (exibia "sem meta"
apesar de haver uma meta de 20% cadastrada). A agregação passou a carregar
rótulo primário e secundário como campos separados, sem concatenação,
eliminando a colisão.

A tela foi conferida nos seis blocos com a competência de outubro de 2026 em
rascunho: os cinco grupos de escopo exato (classe, moeda geral, estratégia,
renda fixa e renda variável) somam aproximadamente 100%, a meta de cada linha
corresponde à tabela `Tables_Atual_Ideal`, e os pares sem meta cadastrada
(subclasses de renda variável fora das cinco metas definidas) aparecem como
"sem meta" em vez de zero ou erro. A revisão visual cobriu desktop e mobile.
`pnpm check`, `pnpm build` e `pnpm test:e2e` passaram sem alterações na
suíte existente.

## Referências

- [Classificações e metas de alocação](007-allocation-data.md)
- [Domínio inicial da carteira](005-portfolio-domain.md)
- [Diagnóstico do Excel](../context/excel-analysis.md)
