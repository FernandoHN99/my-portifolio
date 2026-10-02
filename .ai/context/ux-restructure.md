# Reestruturação da UX

Registrado em: 2026-10-01
Origem: briefing do usuário, com capturas da planilha anexadas na conversa.
Estágio: fatias acordadas concluídas em 2026-10-02; resta a 016, sem prazo, e as decisões abertas abaixo.

Este documento é a fonte principal do propósito, das restrições e das regras
de cálculo desta iniciativa. As specs descrevem cada fatia e apontam para
aqui em vez de repetir estas definições.

## Propósito do produto

O app serve para o usuário percorrer o histórico dos investimentos e entender
o que fazer na prática:

- selecionar um mês e ver toda a carteira daquele mês responder na hora;
- comparar alocação atual com a ideal e receber a ação correspondente,
  comprar ou vender, com o valor em reais;
- consultar e editar os dados de qualquer mês com a facilidade da planilha.

## Restrições declaradas pelo usuário

- Previdência não entra em nenhuma fatia desta reestruturação;
- não haverá serviço de sincronização com o Excel; a importação já ocorreu
  uma vez e o aplicativo passou a ser a fonte da verdade;
- a barra lateral é removida e a navegação fica no topo;
- as bibliotecas atuais são mantidas: Next 16, React 19, Prisma, shadcn com
  Base UI, Tailwind 4, Phosphor e Zod.

## Regras de cálculo

- `Total(R$)` de uma posição com ticker é quantidade vezes a cotação do mês;
  sem ticker, a quantidade já é o próprio valor em reais;
- as cotações ficam em reais; `USD` representa o câmbio do mês e as posições
  em dólar, como USDC e Time Deposit, usam esse ticker;
- a moeda base da posição é a moeda de exposição do ticker; sem ticker, BRL;
- o total rateado de uma classificação é o peso do rateio aplicado ao total
  da posição;
- `Total(US$)` é o total em reais dividido pelo câmbio do mês;
- todas as análises partem das classificações ponderadas, não do nome do
  ativo;
- a identidade de uma posição é o seu identificador; data e nome nunca devem
  ser usados como chave, porque a planilha tinha nomes repetidos no mesmo mês
  e isso gerava erro.

## Denominadores dos percentuais

A planilha era inconsistente neste ponto. A definição adotada é:

- geral: percentual sobre o patrimônio total;
- caixa, renda fixa e renda variável: percentual sobre o total atual da
  respectiva classe;
- o valor ideal de uma subcategoria é o percentual ideal aplicado ao valor
  ideal da classe-mãe.

## Valor ideal e diferença

Conferido em 2026-10-01 contra as capturas da tabela dinâmica enviadas pelo
usuário, em setembro de 2026, com patrimônio de R$ 251.151,11:

- o valor ideal de uma categoria do recorte geral é o percentual ideal
  aplicado ao patrimônio total: renda fixa com 25% resulta em R$ 62.787,78;
- o valor ideal de uma subcategoria encadeia pelo ideal da classe-mãe, não
  pelo total atual dela: caixa em dólar com 40% sobre o ideal de caixa,
  R$ 37.672,67, resulta em R$ 15.069,07; IPCA curto com 10% sobre o ideal de
  renda fixa resulta em R$ 6.278,78;
- a diferença é o valor atual menos o valor ideal, em reais; caixa em dólar
  com R$ 14.078,13 atual resulta em menos R$ 990,93, portanto comprar.

Esta é a definição correta. A spec 009 havia aplicado a diferença percentual
sobre o total atual da categoria, o que produz outro número, e foi corrigida
pela spec 012.

## Bibliotecas escolhidas para a iniciativa

Gráficos com Recharts pelo wrapper de gráfico do shadcn; tabela com
`@tanstack/react-table` e `@tanstack/react-virtual`; estado de mês e filtros
na URL com `nuqs`; transições com `motion`; formulários com
`react-hook-form` e o resolver de Zod; avisos com `sonner`; datas com
`date-fns`; números animados com `@number-flow/react`; atalhos com
`react-hotkeys-hook`; mutações por Server Actions.

Formatação com `Intl.NumberFormat` em pt-BR e cores fixas por categoria, de
modo que uma mesma classe tenha sempre a mesma cor em todos os gráficos.

## Retorno do usuário após as fatias 010 e 011

Registrado em 2026-10-01, com novas capturas da tabela dinâmica.

- o padrão de transições agradou e deve ser mantido;
- a aba de alocação deve deixar de existir; toda a análise se concentra na
  Visão Geral, com gráficos fáceis de ler e interação no nível do gráfico de
  evolução do patrimônio;
- dos gráficos da planilha, falta reproduzir renda fixa por duração;
- a troca de mês e o gesto lateral ainda parecem um recarregamento; isso deve
  ficar contínuo, usando os recursos do próprio Next;
- a aba de posições deve receber filtros de seleção múltipla por instituição,
  moeda e classe, para consultar e editar um recorte específico, como a
  planilha permite;
- em algum momento será preciso editar os valores das posições e as metas da
  carteira ideal; o usuário não fixou se agora ou depois;
- ideia registrada para o futuro: clicar em uma linha da aba de posições abre
  a evolução daquela posição e também a do ativo em si.

## Recortes da tabela dinâmica

As capturas mostram dois níveis de segmentação que o produto deve reproduzir:

| Classificação | Subclassificação | Escopo correspondente |
|---|---|---|
| 1- Geral | 1- Classe | classe de ativos |
| 1- Geral | 2- Moeda | moeda geral |
| 1- Geral | 3- Estratégia | estratégia |
| 2- Caixa | 1- Moeda | moeda dentro da classe caixa |
| 2- Renda Fixa | 1- Subclasse | subclasse e duração da renda fixa |
| 3- Renda Variável | 1- Subclasse | subclasse da renda variável |

A tabela resultante agrupa as linhas sob os títulos COMPRAR e VENDER e traz
percentual atual, percentual ideal, valor atual, valor ideal e diferença.

## Fatias

1. [010 — Navegação no topo e seletor global de mês](../specs/010-global-shell-month-selector.md): concluída.
2. [011 — Visão Geral](../specs/011-overview-tab.md): concluída.
3. [012 — Rebalanceamento na Visão Geral](../specs/012-rebalancing-in-overview.md): concluída.
4. [015 — Transições sem recarregamento](../specs/015-seamless-transitions.md): concluída.
5. [013 — Posições: filtros e consulta](../specs/013-positions-filters.md): concluída.
6. [017 — Posições: edição](../specs/017-positions-editing.md): concluída.
7. [014 — Configuração da carteira](../specs/014-target-settings.md): concluída.
8. [016 — Histórico de uma posição e de um ativo](../specs/016-position-history.md): planejada, sem prazo.
9. [018 — Tolerância ajustável](../specs/018-adjustable-tolerance.md): concluída.

Cada fatia termina com `pnpm check`, `pnpm build` e os testes do Playwright.

## Decisões abertas após as fatias acordadas

Registradas em 2026-10-02, aguardando o usuário:

- executar "Atualizar carteira" sobre um rascunho sobrescreve cotações
  editadas manualmente; decidir entre avisar, preservar ou sobrescrever
  ([spec 017](../specs/017-positions-editing.md));
- oferecer edição de posições no celular, onde a coluna de quantidade fica
  oculta (spec 017);
- criar ativos e contas novos pela interface, o que exige definir símbolo e
  tipo de cotação (spec 017);
- confirmar o ativo "Solana" com ticker USD, que convive com o "Solana" de
  ticker SOL (spec 017);
- permitir criar e remover categorias de metas
  ([spec 014](../specs/014-target-settings.md));
- agendar a [spec 016](../specs/016-position-history.md), histórico de uma
  posição e de um ativo.

## Respostas do usuário em 2026-10-02

Registradas após a conclusão da fatia 014:

- as cotações devem guardar histórico diário, não só o valor do mês;
- as metas são globais: alterar hoje recalcula todos os meses, inclusive os
  passados. É o comportamento atual; as versões salvas do plano servem apenas
  como registro de quando as metas mudaram, não como meta por época;
- a faixa de tolerância do rebalanceamento passa a ser configurável na tela
  de Configuração ([spec 018](../specs/018-adjustable-tolerance.md));
- o histórico de cada ativo, previsto na
  [spec 016](../specs/016-position-history.md), virá das cotações diárias.

Próximas fatias registradas, ainda sem spec, na ordem informada:

1. separar a atualização de cotações, executada a cada hora e guardando o
   histórico diário, da criação automática dos meses que faltam;
2. trocar o duplo clique da edição de posições por um ícone de lápis;
3. padronizar as cotações.

## Critérios de aceite da iniciativa

- não existe barra lateral nem aba de alocação; a análise fica na Visão
  Geral e as abas no topo têm transição, com gesto lateral no mobile;
- trocar de mês ou de aba não produz sensação de recarregamento;
- trocar o mês no seletor global atualiza indicadores, gráficos, alocação e
  posições, e o mês permanece na URL;
- o gráfico de evolução tem seleção de intervalo e atalhos de período, e
  clicar em uma coluna seleciona o mês;
- a aba de alocação tem as quatro sub-abas, cada uma com gráficos de atual
  contra ideal e tabela de comprar ou vender;
- a aba de posições tem filtros por coluna, atalhos por classe, totais
  filtrados e edição direta; meses passados exigem confirmação;
- o rateio de uma posição valida soma igual a 100% e existe a função de
  clonar o mês anterior;
- a configuração valida 100% por grupo e mostra prévia das ações antes de
  salvar;
- nada de Previdência.
