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

Cada fatia termina com `pnpm check`, `pnpm build` e os testes do Playwright.

## Respostas do usuário em 2026-10-02

Registradas antes de qualquer implementação, a pedido do usuário.

### Atualização: são dois processos distintos

A planilha misturava duas coisas no mesmo botão, e a spec 003 herdou essa
confusão. O usuário separou:

1. **Atualização de cotações**: busca somente o valor das cotações, nunca as
   quantidades. Deve rodar automaticamente uma vez por hora, com um botão de
   atualização manual.
2. **Virada de mês das posições**: checagem automática ao abrir o
   aplicativo. Se o mês virou e a competência do mês corrente ainda não
   existe, gera as posições copiando o mês anterior. Se passou mais de um mês,
   gera todas as competências faltantes, considerando a data do último dia de
   cada mês.

A forma de interpretar "considerando a data do último dia do mês" ainda
precisa ser confirmada: provavelmente a cotação de cada competência gerada
deve ser a do último dia daquele mês.

Pergunta do usuário: "temos uma tabela de cotação?". Sim: `market_quotes`,
com uma cotação em reais por símbolo e competência (data no primeiro dia do
mês), tipo de instrumento e moeda base. Hoje a granularidade é mensal.

Decisão do usuário em 2026-10-02: as cotações guardam **histórico diário**
por ativo, como já previa o documento de arquitetura. A atualização horária
acumula o histórico do dia em vez de sobrescrever a cotação do mês, e a
cotação de uma competência passa a ser derivada desse histórico.

### Edição: lápis em vez de duplo clique

O usuário não gostou do duplo clique. Quer um botão de lápis que coloque as
posições em modo de edição, com todos os campos editáveis ao mesmo tempo; ao
confirmar, a mensagem de confirmação continua aparecendo. Essa forma também
resolve a edição no celular.

### Cotações: padronização futura

O ativo "Solana" com ticker USD fica como está na planilha original por
enquanto. Fica mapeado para o futuro gerar todas as cotações corretamente,
padronizando símbolos e fontes.

### Próximas fatias decorrentes

- separar a atualização de cotações (automática a cada hora e manual) da
  virada de mês das posições (automática, preenchendo meses faltantes);
- substituir o duplo clique por modo de edição com lápis, válido também no
  celular;
- padronizar as cotações de todos os ativos, sem prazo;
- tornar ajustável a faixa de tolerância dentro da configuração existente,
  hoje fixa em dois pontos percentuais.

A spec 014 foi commitada em 2026-10-02 com aprovação do usuário.

### Metas são globais

O usuário esclareceu que as metas são globais: mudar uma meta hoje muda os
cálculos de qualquer competência, inclusive as passadas. É o comportamento
já implementado, porque toda análise usa a versão vigente. As versões
guardadas pela spec 014 servem apenas como registro de quando as metas
mudaram, não como metas aplicadas por período.

O item aberto "criar e remover categorias de metas" referia-se a incluir uma
nova classe, moeda ou estratégia no plano, e não a metas por período. Fica
mantido como possibilidade, sem pedido do usuário.

### Histórico de posição e de ativo

O usuário observou que o histórico de uma posição já existe nas competências
mensais. O histórico do ativo deve vir das cotações guardadas diariamente por
ativo, o que liga a spec 016 à decisão de histórico diário acima.

## Decisões abertas após as fatias acordadas

Registradas em 2026-10-02, aguardando o usuário:

- respondidas em 2026-10-02 e registradas acima: sobrescrita de cotações
  pela atualização, edição no celular e o ativo "Solana" com ticker USD;
- criar ativos e contas novos pela interface, o que exige definir símbolo e
  tipo de cotação ([spec 017](../specs/017-positions-editing.md));
- tolerância ajustável: decidida em 2026-10-02, vai para a configuração;
- criar e remover categorias de metas: mantido sem pedido do usuário
  ([spec 014](../specs/014-target-settings.md));
- agendar a [spec 016](../specs/016-position-history.md), que depende do
  histórico diário de cotações.

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
