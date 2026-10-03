# Reestruturação da UX

Registrado em: 2026-10-01
Origem: briefing do usuário, com capturas da planilha anexadas na conversa.
Estágio: fatias acordadas, a 016 e as specs 028 a 037 concluídas em 2026-10-02; restam o passo pré-produção e o backlog.

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
8. [016 — Histórico de uma posição e de um ativo](../specs/016-position-history.md): concluída; ver item 19.
9. [018 — Faixa de tolerância ajustável](../specs/018-adjustable-tolerance.md): concluída.
10. [019 — Modo de edição com lápis](../specs/019-pencil-edit-mode.md): concluída.
11. [020 — Cotações diárias e atualização ao abrir](../specs/020-daily-quotes.md): concluída.
12. [021 — Virada de mês automática](../specs/021-automatic-month-rollover.md): concluída.
13. [023 — Linha do tempo compacta](../specs/023-compact-month-timeline.md): concluída.
14. [024 — Visão Geral: duração, variação no período e hover](../specs/024-overview-adjustments.md): concluída.
15. [025 — Listas de seleção estilizadas](../specs/025-styled-pickers.md): concluída.
16. [027 — Ajustes na configuração de metas](../specs/027-target-settings-adjustments.md): concluída.
17. [022 — Página de cotações em Posições](../specs/022-quotes-page.md): concluída.
18. [026 — Inclusão de posição com conta, instituição, ativo e vencimento novos](../specs/026-new-position-entities.md):
    concluída.
19. [016 — Histórico de uma posição e de um ativo](../specs/016-position-history.md):
    interrompida em 2026-10-02 a pedido do usuário e concluída no mesmo dia,
    depois das respostas da segunda rodada.
20. [028 — Regras de cotação](../specs/028-quote-rules.md): concluída.
21. [029 — Histórico de 3 anos ao incluir um ativo](../specs/029-asset-price-history.md): concluída.
22. [030 — Visão Geral: meses do calendário, início do período e metas sem posição](../specs/030-overview-calendar-comparisons.md): concluída.
23. [031 — Posições: vencimento, filtros em cascata e campos de 16 px](../specs/031-positions-cascading-filters.md): concluída.
24. [032 — Finalizar o mês corrente](../specs/032-finalize-current-month.md): concluída.
25. [033 — Escolha da moeda da CoinGecko](../specs/033-coingecko-coin-choice.md): concluída.
26. [034 — Mês aberto ou fechado na linha do tempo](../specs/034-open-closed-months.md): concluída.
27. [035 — Resgate fixo e classes existentes no rateio](../specs/035-redemption-and-known-classes.md): concluída.
28. [036 — Altcoins como moeda base](../specs/036-altcoins-currency.md): concluída.
29. [037 — Provedores de cotação em cadeia](../specs/037-quote-provider-chains.md): concluída.

As specs 016 e 028 a 033 foram implementadas em sequência no `main` em
2026-10-02, com autorização do usuário para commitar e dar push sem pedir
aprovação a cada commit. Os branches `wip/016-pagina-da-posicao` e
`claude/sleepy-goodall-qrywar`, este já integrado, foram apagados.

As fatias 020, 021 e 023 a 027 foram implementadas em paralelo, cada uma num
worktree com banco próprio, revisadas por um revisor independente e
integradas em 2026-10-02. Na integração, a virada automática de mês passou a
criar outubro de 2026 ao abrir o aplicativo, o que expôs testes que
supunham setembro como competência mais recente. Todos os testes de
interface passaram a substituir a checagem de abertura por uma resposta fixa
(`tests/e2e/support/quote-checks.ts`), para nunca gravar nos dados reais, e a
entrar em edição pelo auxiliar `tests/e2e/support/edit-mode.ts`, que confirma
o histórico quando a competência não é a mais recente.

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

Confirmado pelo usuário em 2026-10-02: "considerando a data do último dia do
mês" significa que a cotação de cada competência gerada é a do último dia
daquele mês.

Pergunta do usuário: "temos uma tabela de cotação?". Sim: `market_quotes`,
com uma cotação em reais por símbolo e competência (data no primeiro dia do
mês), tipo de instrumento e moeda base. Hoje a granularidade é mensal.

Decisão do usuário em 2026-10-02: as cotações guardam **histórico diário**
por ativo, como já previa o documento de arquitetura. A atualização horária
acumula o histórico do dia em vez de sobrescrever a cotação do mês, e a
cotação de uma competência passa a ser derivada desse histórico.

Decisão do usuário em 2026-10-02 sobre o "a cada hora": não haverá
agendador. Ao abrir o aplicativo, ele verifica se a última atualização de
cotações tem mais de uma hora e, nesse caso, atualiza.

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
  celular: concluída na [spec 019](../specs/019-pencil-edit-mode.md);
- padronizar as cotações de todos os ativos, sem prazo;
- tornar ajustável a faixa de tolerância dentro da configuração existente,
  antes fixa em dois pontos percentuais: concluída na
  [spec 018](../specs/018-adjustable-tolerance.md).

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

## Ajustes pedidos em 2026-10-02, antes da previdência

Pedidos do usuário depois da spec 019, com captura dos gráficos de renda fixa
por duração da planilha. O usuário pediu para executar tudo direto,
commitando cada fatia validada, e para perguntar em caso de dúvida.

- linha do tempo dos meses menos esticada: os meses entram e saem de dentro
  do ano, com animação ([spec 023](../specs/023-compact-month-timeline.md));
- renda fixa por duração como na planilha: um gráfico do atual em cima e um
  do ideal embaixo, barras agrupadas por subclasse com séries Curto, Médio e
  Longo; o card "Fora da meta" sai e entra a variação em todo o período;
  todos os cards ganham o hover dos cards de patrimônio e variação
  ([spec 024](../specs/024-overview-adjustments.md));
- todas as listas de seleção estilizadas, abrindo as opções ao clicar no
  campo ([spec 025](../specs/025-styled-pickers.md));
- "Adicionar posição" mais em evidência, permitindo digitar conta e
  instituição novas e cadastrar ativo novo; a estratégia continua como está;
  ao escolher a classe de um ativo com ticker, o provedor correspondente
  confere se o ticker existe; renda fixa ganha data de vencimento opcional
  ([spec 026](../specs/026-new-position-entities.md));
- na configuração, o deslizante anda de 1 em 1 ponto, mas o campo aceita
  valor quebrado; a prévia não volta sozinha para a aba Classe; "Restaurar
  padrão do Excel" continua ([spec 027](../specs/027-target-settings-adjustments.md));
- a página "Revisão de dados" e o bloco "Dados da carteira" da configuração
  saem; a atualização e as cotações do mês ficam numa página única aberta
  por um botão em Posições; a última atualização aparece no topo, com o botão
  de atualizar ao lado, e cada falha de cotação vira um aviso com o ativo
  ([spec 020](../specs/020-daily-quotes.md) e
  [spec 022](../specs/022-quotes-page.md));
- clicar numa posição abre a página da posição, com a evolução dela, o
  gráfico do ativo e indicadores de valorização
  ([spec 016](../specs/016-position-history.md)).

Respostas às perguntas feitas no mesmo dia:

- as specs 020 (cotações diárias e atualização ao abrir) e 021 (virada de
  mês automática) entram neste pacote;
- a data de vencimento da renda fixa é informativa: aparece na tabela e na
  página da posição, com aviso de vencido ou vencendo; a duração Curto,
  Médio e Longo continua manual no rateio;
- o vencimento vale só para ativos novos; os nomes atuais, como
  "LCI BRB - Set/26", ficam como estão;
- a página de cotações é única: um botão em Posições abre as cotações do mês,
  editáveis, a última atualização, o botão de atualizar e o histórico de
  execuções, e o painel recolhível sai da tabela.

## Decisões abertas após as fatias acordadas

Registradas em 2026-10-02, aguardando o usuário:

- respondidas em 2026-10-02 e registradas acima: sobrescrita de cotações
  pela atualização, edição no celular e o ativo "Solana" com ticker USD;
- criar ativos e contas novos pela interface, o que exige definir símbolo e
  tipo de cotação ([spec 017](../specs/017-positions-editing.md)): pedido pelo
  usuário e concluído na [spec 026](../specs/026-new-position-entities.md);
- tolerância ajustável: decidida e concluída em 2026-10-02, na
  [spec 018](../specs/018-adjustable-tolerance.md);
- criar e remover categorias de metas: mantido sem pedido do usuário
  ([spec 014](../specs/014-target-settings.md));
- [spec 016](../specs/016-position-history.md): concluída em 2026-10-02.

## Respostas do usuário às questões em aberto, 2026-10-02 (segunda rodada)

Respostas dadas de uma vez às perguntas consolidadas das specs 016 e 020 a
026, com autorização para implementar tudo em sequência, commitar e dar push
sem pedir aprovação a cada commit, apagar os branches extras e seguir até
travar. Previdência continua fora.

### Decisões

- **Cotações independentes**: cada ativo é atualizado sozinho; uma falha não
  impede as outras (spec 020).
- **Edição manual de cotação**: o usuário não pretende editar cotações à mão.
  A edição fica disponível só para a cotação que não foi encontrada ou cuja
  última busca deu erro (spec 020 e 022).
- **Voltar a uma aba aberta há mais de uma hora** conta como abrir o
  aplicativo (spec 020).
- **Um aviso por atualização** listando os ativos com falha atende (spec 020).
- **Botão "Cotações"** no cabeçalho de Posições está correto (spec 022).
- **Histórico de execuções**: sempre todas as execuções, independentemente
  do mês selecionado, cobrindo os últimos 36 meses (spec 022).
- **Última atualização de posição incluída**: em vez de "–", mostrar a data
  da inclusão, indicando que veio da inclusão.
- **Endereços antigos** (`/atualizacao`, `/revisao` e afins) devem ser
  removidos.
- **Botão de atualizar cotações** só aparece quando a competência
  selecionada é o mês corrente.
- **Cotação de fechamento do mês**: todos os meses guardam, para todos os
  ativos, a cotação do último dia disponível daquele mês. Gráficos e
  valorização usam sempre essa cotação de fechamento. As cotações diárias
  continuam guardadas, sem apagar as antigas; vale sempre a mais recente do
  mês. Meses passados que não tiveram esse cuidado ficam para o passo
  pré-produção abaixo.
- **Histórico de 3 anos ao incluir ativo novo**: ao incluir um ativo no mês
  corrente, buscar a cotação de fechamento mensal dos últimos 3 anos (ou o
  que existir, se o ativo for mais novo), desde que isso caiba numa única
  chamada por ativo ou dentro dos limites dos provedores. O agente avalia
  cada provedor e informa.
- **Meses gerados ficam em rascunho**; o mês corrente pode ser marcado como
  finalizado, e a partir daí editá-lo exige a mesma confirmação dos meses
  passados. Rotina do usuário: ajusta aportes no começo do mês e depois só
  acompanha.
- **A tela passa sozinha para o mês novo** quando nenhum mês está fixado
  (mantido; o usuário pediu uma explicação).
- **Linha do tempo centralizada** na tela larga, em vez de alinhada à
  esquerda.
- **Variação no mês e em 12 meses** por meses do calendário, com
  "Histórico insuficiente" quando o mês de comparação não existir. Depois
  do passo pré-produção, o histórico ficará completo.
- **"Todo o período"** começa na primeira competência minimamente completa,
  escolhida pelo agente pelos dados.
- **Meta sem posição aparece como "Comprar"** na tabela de comprar e vender
  (o usuário pediu uma explicação).
- **Não mexer em dados antigos agora**: qualquer correção do histórico
  importado fica para o passo pré-produção.
- **Duração da renda fixa** (D+0, D+1, Curto, Médio, Longo) é, na planilha, o
  prazo de resgate para liquidez, não o tempo até o vencimento. O vencimento
  é o campo opcional novo. Pedido: coluna de vencimento na tabela de
  posições, com filtro.
- **Filtros em cascata**: as opções de cada filtro passam a considerar os
  filtros escolhidos antes dele, na ordem em que foram aplicados; por
  exemplo, escolher a classe Caixa limita a subclasse às que existem em
  Caixa.
- **Campos com 16 px no celular**, para o Safari não ampliar a página.
- **CoinGecko**: quando houver várias moedas com o mesmo símbolo, o usuário
  escolhe numa lista.
- **Cripto sem moeda conferida** continua buscando a moeda a cada
  atualização.
- **Posição pendente da inclusão** expira em 2 h, como está.
- **Página da posição** é rota própria.
- **Vencimento** é editável na página da posição; nada é inferido para os
  ativos importados.

### Passo pré-produção

Antes de subir para produção, o usuário e o agente vão preparar um arquivo
com o histórico completo e correto: todas as colunas e valores, posições e
ativos duplicados para os meses que faltam, a cotação de fechamento do último
dia de cada mês e a revisão das classificações herdadas, como D+0 e D+1 em
renda fixa e o BTC classificado como renda fixa de outubro a dezembro de
2025. Preencher meses faltantes por um botão ou automaticamente **não** é
funcionalidade do aplicativo; é uma preparação única. Detalhes em
[Passo pré-produção](pre-deploy.md).

### Backlog

- Previdência, que o usuário indicou como próximo assunto.
- Livro de movimentações (compras e vendas), que permitiria separar aporte de
  variação de preço com exatidão.

### Ainda sem resposta, aguardando explicação

O usuário não entendeu estas perguntas; o comportamento atual fica valendo
até ele responder:

- a execução antiga de "Atualizar carteira" no histórico de cotações
  (spec 022);
- abrir outro ano na linha do tempo seleciona ou não um mês daquele ano
  (spec 023): não se trata de várias linhas do tempo, apenas do clique num
  ano diferente do atual;
- recusar classes fora da lista no rateio (spec 025);
- os 30 dias para "vencendo" e o USD como moeda base das criptos que não são
  o BTC (spec 026), que o usuário tende a aceitar.

Explicações preparadas para o usuário (registradas na spec de cada assunto):

- **"Atualizar carteira"** (spec 022): era o botão antigo da spec 003, que
  buscava as cotações e criava o mês numa ação só. Foi substituído pela
  atualização automática (020) e pela virada de mês (021). A execução que ele
  deixou aparece no histórico como "Fluxo anterior", só para leitura. A
  pergunta é se ela pode sumir do histórico;
- **outro ano na linha do tempo** (spec 023): a linha é uma só. Ao clicar no
  ano de 2024 estando em Set/26, hoje só os meses de 2024 se abrem e a tela
  continua em Set/26 até um mês ser clicado. A alternativa é já abrir um mês
  de 2024;
- **rateio** (spec 025): é a divisão de uma posição entre classificações
  (classe, subclasse e prazo), com pesos que somam 100%, editada pelo botão de
  pizza no modo de edição. Digitar uma classe nova oferece "Usar ‘nome’"; a
  pergunta é se só as classes existentes devem ser aceitas;
- **"vencendo" e moeda base** (spec 026): o selo fica amarelo a 30 dias do
  vencimento; e, no recorte por moeda, o BTC conta como BTC e as outras
  criptos como dólar;
- **a tela passa sozinha para o mês novo** (spec 021), confirmada pelo
  usuário com pedido de explicação: quando o mês vira, quem está vendo o app
  sem um mês fixado no endereço passa a ver o mês novo; com um mês fixado ou
  edição pendente, nada muda;
- **meta sem posição como "Comprar"** (spec 030), confirmada com pedido de
  explicação: se a meta diz 10% em IPCA Curto e a carteira não tem nenhuma
  posição nisso, a tabela de comprar e vender passa a mostrar a linha com 0%
  atual e o valor a comprar, em vez de omiti-la.

## Respostas do usuário, 2026-10-02 (terceira rodada)

Dadas depois das specs 028 a 033, com nova autorização para implementar,
commitar e dar push em sequência.

- **"Atualizar carteira"** pode sair do histórico. A criação do mês deve ser
  conferida sempre: ao abrir, de hora em hora com o app aberto e no botão de
  atualizar ([spec 034](../specs/034-open-closed-months.md)).
- **Linha do tempo**: sem as setas e sem "Mais recente". No lugar, "Fechado"
  com cadeado ou "Aberto" com cadeado aberto e "Fechar mês". Sem o selo "Mês de
  ano · Rascunho" nos cabeçalhos. Editar posições só com o mês aberto
  ([spec 034](../specs/034-open-closed-months.md)).
- **Resgate**: o antigo campo de duração vira "Resgate", com Curto, Médio,
  Longo ou Nenhum; a subclasse continua livre
  ([spec 035](../specs/035-redemption-and-known-classes.md)).
- **Rateio**: só classes existentes, por enquanto
  ([spec 035](../specs/035-redemption-and-known-classes.md)).
- **Moeda**: o que não for BTC entre as criptos é "Altcoins"; as moedas
  possíveis passam a ser EUR, USD, BRL, Altcoins e BTC, pela moeda base do
  ativo ([spec 036](../specs/036-altcoins-currency.md)).
- **APIs**: pesquisar fontes públicas ou com chave gratuita de limite maior,
  inclusive para ETFs da B3 e meses anteriores, e usá-las com prioridade
  ([spec 037](../specs/037-quote-provider-chains.md)).
- **Mês novo automático**: confirmado.
- **Selo de vencimento**: confirmado.
- **Cotações**: o botão sai de Posições e vira um ícone ao lado da última
  atualização ([spec 034](../specs/034-open-closed-months.md)).

Ainda aberta: o usuário escreveu "Atualizado às <tempo>"; o topo mostra
"Atualizado há N min". Não ficou claro se ele quer o horário absoluto.

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
