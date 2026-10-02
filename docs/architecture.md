# Decisões de arquitetura e funcionamento

Estado: base aprovada; implementação incremental autorizada.
Origem: decisões explícitas do usuário na conversa de descoberta.
Registrado em: 2026-09-21.
Última atualização: 2026-10-02.

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
([spec 021](../.ai/specs/021-automatic-month-rollover.md)). Não haverá
agendamento nem tentativa de atualizar com o aplicativo desligado.

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

### Acesso inicial

A primeira versão funciona somente no computador local e não possui
autenticação.

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

A navegação principal fica no topo, em abas: Visão Geral, Alocação e
Posições, com a configuração da carteira em um acesso próprio. Não há barra
lateral.

Um seletor global de competência governa todas as telas e fica registrado na
URL. O propósito do produto é percorrer o histórico mês a mês e comparar a
alocação atual com a meta, obtendo a ação correspondente. Após a carga
inicial, o aplicativo é a fonte da verdade; não haverá sincronização
contínua com a planilha.

## Questões ainda em aberto

- Regras finais de correção e auditoria após a importação inicial.
- Fontes gratuitas de cotações, prioridade entre provedores e tratamento
  específico dos limites de cada serviço.
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
