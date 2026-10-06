# Decisões de arquitetura e funcionamento

Estado: base aprovada; implementação incremental autorizada.
Origem: decisões explícitas do usuário na conversa de descoberta.
Registrado em: 2026-09-21.
Última atualização: 2026-10-02 (segunda rodada de respostas).

Este documento é a fonte principal das decisões consolidadas abaixo.
O diagnóstico do sistema existente permanece em
[Análise do Excel](../.ai/context/excel-analysis.md).

## Decisões confirmadas

### Interface e backend no mesmo projeto Next.js

Manter a interface e as funções de servidor no mesmo projeto Next.js,
com cálculos e integrações separados das telas. A organização interna
e as bibliotecas específicas ainda serão definidas.

### Ambiente de desenvolvimento

Executar Next.js diretamente no computador e PostgreSQL em Docker
durante o desenvolvimento. Esta decisão não define o empacotamento
nem a hospedagem de produção.

Atualizado em 2026-10-03: testes que gravam usam um schema próprio no mesmo
Postgres, indicado em `?schema=` na `DATABASE_URL`
([spec 042](../.ai/specs/042-data-backup.md)).

### Evolução do histórico

Guardar preços diários e posições mensais revisadas, evoluindo o
modelo da planilha. Uma atualização de preço não representa uma
mudança de quantidade.

Atualizado em 2026-10-02: a atualização de cotações e a criação do mês
são processos distintos. As cotações ficam em histórico diário por
símbolo e são atualizadas ao abrir o aplicativo, quando a última tentativa
tem mais de uma hora, ou pela seta do topo; a competência do mês corrente
é reprecificada a cada atualização
([spec 020](../.ai/specs/020-daily-quotes.md)). Também ao abrir, antes
das cotações, o aplicativo cria a competência do mês corrente e todas as
que faltarem, copiando a anterior, com a cotação do último dia de cada mês
disponível no histórico
([spec 021](../.ai/specs/021-automatic-month-rollover.md)). Desde
2026-10-06, ele pergunta antes de criar
([spec 078](../.ai/specs/078-overview-allocation-tabs-and-touch-charts.md)). Não haverá
agendamento nem tentativa de atualizar com o aplicativo desligado.

Atualizado em 2026-10-04: a atualização das cotações saiu da abertura do
aplicativo e passou a um job agendado, que roda sem o aplicativo aberto e
busca só os símbolos devidos ([spec 053](../.ai/specs/053-scheduled-quote-sync.md)).
As posições ganharam movimentações (aporte, retirada, rendimento e saldo
inicial) sobre a base de cada mês, sem correção em cascata entre competências
([specs 056 a 059](../.ai/specs/056-position-transactions.md)), e a renda fixa
a percentual do CDI é calculada pelo job a partir do CDI diário
([spec 060](../.ai/specs/060-cdi-fixed-income.md)).

Atualizado em 2026-10-03: só há atualização automática; a seta do topo e o
botão da página de cotações saíram, a pedido do usuário. As cotações
automáticas, o histórico diário e as execuções são compartilhados entre os
usuários, e a cotação digitada à mão, quando a busca falha, fica com quem a
digitou ([spec 051](../.ai/specs/051-shared-automatic-quotes.md)).

Atualizado em 2026-10-02: cada mês guarda, para cada ativo, a cotação de
fechamento, a mais recente do mês; gráficos e valorização usam essa cotação,
e as anteriores não são apagadas. Ao incluir um ativo novo, o fechamento
mensal dos últimos três anos é buscado uma vez, conforme os limites de cada
provedor ([spec 028](../.ai/specs/028-quote-rules.md) e
[spec 029](../.ai/specs/029-asset-price-history.md)). O mês corrente pode
ser finalizado, e editá-lo passa a pedir a confirmação dos meses passados
([spec 032](../.ai/specs/032-finalize-current-month.md)). Preencher meses
passados que faltam não é funcionalidade do aplicativo: é o
[passo pré-produção](../.ai/context/pre-deploy.md).

### Importação do Excel

Usar o próprio Excel como fonte da carga inicial. Preservar os dados de
origem e apresentar inconsistências encontradas para revisão, sem aplicar
correções silenciosas.

A identidade do ativo é independente da custódia. Bitcoin, USDC e qualquer
outro ativo mantido em instituições ou contas diferentes gera posições
separadas. Relatórios podem consolidar essas posições pelo ativo, sem apagar a
origem de cada saldo.

A linha inconsistente de Bitcoin de junho de 2023 permanece pendente. A carga
inicial deve preservá-la como evidência, mas não deve criar uma posição
financeira corrigida por suposição.

Atualizado em 2026-10-02: a tela de revisão dos achados foi removida a
pedido do usuário ([spec 022](../.ai/specs/022-quotes-page.md)). Os dados de
origem e os achados continuam preservados nas tabelas da importação.

Atualizado em 2026-10-03: o histórico das posições passa a vir da preparação
única do [passo pré-produção](../.ai/specs/041-history-preparation.md), feita
com o usuário a partir das tabelas exportadas da planilha: meses sem lacunas,
cotação de fechamento de cada mês buscada nos provedores e cada unificação de
ativo confirmada por ele. O Bitcoin de junho de 2023 recebeu, por resposta
dele, a quantidade de julho.

Atualizado em 2026-10-03: a importação do Excel saiu do aplicativo, com os
roteiros, as tabelas `import_batches`, `import_source_rows` e `import_issues`
e os campos de origem das linhas ([spec 047](../.ai/specs/047-json-only-data.md)).
A planilha continua preservada como referência; os dados entram e saem só
pelo backup em JSON.

### Backup dos dados

Decidido em 2026-10-03: o aplicativo exporta todos os dados num arquivo JSON
versionado e restaura um arquivo desses substituindo tudo, numa transação, só
depois de mostrar o resumo e pedir confirmação
([spec 042](../.ai/specs/042-data-backup.md)).

Atualizado em 2026-10-03: o backup é a forma oficial de carregar e levar os
dados, inclusive para o banco de produção. Cada restauração fica registrada em
`data_imports` e aparece nas versões da configuração. O formato e o roteiro
para mudá-lo junto com o modelo estão em [Formato do backup](backup-format.md)
([spec 047](../.ai/specs/047-json-only-data.md)).

### Acesso e usuários

Decisão inicial, de 2026-09-21: a primeira versão funcionava somente no
computador local e não possuía autenticação.

Atualizado em 2026-10-03: com o app publicado na Vercel, o usuário pediu login
no próprio app, e as cotações automáticas passaram a ser compartilhadas entre
os usuários ([spec 050](../.ai/specs/050-login-and-user-data.md) e
[spec 051](../.ai/specs/051-shared-automatic-quotes.md)). O login usa e-mail e
senha com Better Auth e sessões no Postgres; cada usuário tem a própria
carteira, isolada por `user_id` e por chaves estrangeiras compostas, e o
código acessa os dados pelo cliente com escopo (`src/lib/user-db.ts`). As
escolhas feitas pelo agente na ausência do usuário estão na spec 050, a
confirmar.

### Organização do código

Organizar o sistema por módulos funcionais, mantendo rotas e componentes de
página como pontos de composição. Regras financeiras e casos de uso ficam fora
da interface e do acesso ao banco; integrações com Prisma e provedores de
cotação implementam essas fronteiras.

As primeiras áreas previstas são importação, carteira, cotações, alocação e
previdência. Cada fatia deve introduzir apenas as abstrações necessárias ao
comportamento implementado, com nomes explícitos, funções pequenas e testes
concentrados nas regras financeiras de maior risco.

Instituição e conta são entidades distintas. Uma instituição pode conter uma
ou mais contas, e cada posição pertence a uma conta. Essa separação deve
existir mesmo quando a carga inicial tiver apenas uma conta conhecida na
instituição.

### Direção visual

A interface usa exclusivamente tema escuro. Sua direção é a de uma fintech
moderna, premium e confiável: superfícies grafite, contraste alto, cor de
destaque contida, tipografia precisa, números legíveis e densidade adequada a
dados financeiros. Profundidade, transições e estados interativos devem ser
discretos e funcionais.

Não haverá alternância para tema claro. O produto deve evitar aparência de
landing page, efeitos decorativos excessivos e valores financeiros fictícios.

A interface não deve narrar o andamento da implementação, roadmap técnico ou
estado das specs. Esses registros pertencem a `.ai/` e à conversa. Cada tela
do aplicativo deve ajudar o usuário a consultar, revisar ou administrar dados
financeiros reais.

### Navegação e competência selecionada

A navegação principal fica no topo, em abas: Visão Geral e Posições, com a
configuração da carteira em um acesso próprio. A aba de alocação foi
incorporada à Visão Geral na reestruturação da UX. Não há barra lateral.

Um seletor global de competência governa todas as telas e fica registrado na
URL. O propósito do produto é percorrer o histórico mês a mês e comparar a
alocação atual com a meta, obtendo a ação correspondente. Após a carga
inicial, o aplicativo é a fonte da verdade; não haverá sincronização
contínua com a planilha.

## Questões ainda em aberto

- Regras finais de correção e auditoria após a importação inicial.
- Fontes gratuitas de cotações e prioridade entre provedores: definidas em
  2026-10-02 na [spec 037](../.ai/specs/037-quote-provider-chains.md), com
  cadeias de reserva por grupo de ativo.
- Biblioteca dos gráficos, a definir junto da primeira visão analítica.
- Hospedagem e empacotamento fora do ambiente de desenvolvimento.

## Base técnica aprovada

Esta combinação reduz decisões durante a primeira implementação e mantém
as regras financeiras independentes da interface:

- TypeScript em todo o projeto;
- Next.js com App Router;
- Server Components para leituras e Server Actions para mutações da
  interface; Route Handlers somente quando houver um consumidor HTTP ou
  integração externa, ou quando uma operação longa não puder ocupar a fila
  de Server Actions do cliente, como a atualização de cotações
  ([spec 020](../.ai/specs/020-daily-quotes.md));
- PostgreSQL no Docker Compose durante o desenvolvimento;
- ORM tipado com migrações versionadas, com Prisma como primeira opção;
- valores financeiros e percentuais em tipos decimais exatos no banco;
- Tailwind CSS e shadcn/ui para a interface;
- Zod nas fronteiras de entrada e nos dados recebidos dos provedores;
- Playwright para os poucos fluxos completos de maior risco financeiro.

Usar pnpm como gerenciador do projeto. Fixar versões estáveis das
dependências e manter as migrações do banco no Git. A biblioteca de
gráficos será escolhida quando a primeira visão for especificada.

A fundação usa Node.js 24.20.0, Next.js 16, PostgreSQL 18 e Prisma 7.10.
O Prisma 8 disponível durante a criação ainda era uma versão candidata;
por isso, a versão estável 7 foi escolhida e fixada.

## Sequência inicial

1. Fundação técnica e interface-base.
2. Importação auditável do Excel.
3. Atualização mensal manual e cotações sob demanda.
4. Patrimônio, classificações e metas.
5. Rebalanceamento.
6. Previdência.

As specs em `../.ai/specs/` são a fonte do escopo e do estado de cada fatia.
