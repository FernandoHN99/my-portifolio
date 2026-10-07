# Prompt de continuidade — Gastos familiares e acesso por módulo

Preparado em: 2026-10-07.
Atualizado em: 2026-10-07, com o arquivo de gastos corrigido pelo usuário.
Origem: conversa do usuário, briefing e dados anexados.
Estado em 2026-10-07: executado. O usuário pediu o início ("manda ver") e
respondeu às pendências (DEVE/DEVO, valores negativos, parcelas e carga
local); o resultado e as decisões estão nas specs
[081](../specs/081-module-access-and-area-navigation.md),
[082](../specs/082-family-expenses-ledger.md),
[083](../specs/083-family-expense-series.md) e
[084](../specs/084-family-expenses-backup-and-load.md), que passam a ser a fonte
das regras. Os ajustes posteriores de navegação e lista estão na
[085](../specs/085-family-ledger-and-navigation-polish.md), e a pessoa única,
badges e seleção de meses na [086](../specs/086-family-person-and-month-selection.md).
Este arquivo fica como registro do pedido original.

## Arquivos de entrada

- [Backlog](backlog.md): direção confirmada para um app modular e histórico
  da decisão de aguardar o pedido de início.
- [Briefing original](../../backups/gastos-familia/gastos-familia-briefing-original-2026-10-07.txt):
  análise fornecida pelo usuário sobre a aba `Gastos_Familia`.
- [Dados corretos de Gastos familiares](../../backups/gastos-familia/gastos-familia-dados-corretos-2026-10-07.txt):
  nova tabela colada e identificada pelo usuário como o arquivo correto,
  com campos separados por tabulação. A extensão `.txt` e o conteúdo
  original foram preservados integralmente.

O briefing e o arquivo correto foram copiados para `backups/gastos-familia/`, que já é
ignorado pelo Git, para preservar os dados pessoais e evitar depender das
pastas temporárias de anexos do chat. Não os adicione ao Git. Em outro
ambiente, esses arquivos precisarão ser disponibilizados separadamente;
não invente dados se estiverem ausentes.

O primeiro arquivo de dados, com apenas Sandra, foi declarado errado pelo
usuário e está substituído por este novo arquivo. Não o use como fonte ativa,
não una os dois arquivos e não mantenha as contagens anteriores. Sua cópia
`gastos-familia-sandra-original-2026-10-07.txt` fica apenas como evidência
local da versão descartada.

## Objetivo da implementação futura

Implemente a área **Gastos familiares** no app existente. Ela é um controle
de acerto de contas entre o dono da carteira e pessoas da família: registra
quanto cada pessoa lhe deve e quanto ele deve a cada pessoa.

Mantenha um único aplicativo com módulos e navegação próprias. O Portifolio
atual continua como a área de Investimentos, disponível aos amigos que já
tenham acesso ao app. Nesta etapa, somente a conta autenticada
`nandohneto@gmail.com` terá acesso aos módulos pessoais e a todas as áreas
disponíveis. Saúde e controle de remédios continuam fora desta implementação;
não crie telas, menus vazios nem modelos desse módulo.

## Leitura e execução no projeto

1. Leia `AGENTS.md`, `.ai/README.md`, `.ai/context/initial-context.md` e os
   `AGENTS.md` locais antes de trabalhar em cada área. Consulte o código
   atual para conferir os fatos, pois o projeto pode ter evoluído desde a
   preparação deste prompt.
2. Leia o backlog, este prompt, os dois arquivos de entrada,
   `docs/architecture.md`, `docs/backup-format.md` e apenas as specs relevantes.
3. Inspecione o estado do Git, inclusive alterações staged. Preserve o
   trabalho existente. Consulte `docs/git-workflow.md` antes de preparar ou
   executar commits; este prompt não concede autorização para commit, push
   ou deploy.
4. Antes de escrever código Next.js, leia os guias pertinentes em
   `node_modules/next/dist/docs/`, conforme as instruções do repositório.
5. Quando houver autorização de início, divida o trabalho em specs pequenas,
   com estado, critérios de aceite e verificação. Uma divisão possível é:
   autorização e navegação; pessoas e lançamentos; filtros e resumos;
   acerto individual e em lote; backup e carga inicial; recorrências e
   parcelas depois de definir suas regras. Escolha os números pelo índice
   atual de specs, sem presumir o próximo número disponível.
6. Registre as decisões na fonte responsável e faça os outros documentos
   apontarem para ela. O progresso do projeto fica em `.ai/` e na conversa.

## Acesso, identidade e isolamento dos dados

Mantenha Next.js, Better Auth, Prisma e PostgreSQL, hoje no Neon em produção.
O código observado já tem login e acesso aos dados da carteira por `userId`,
mas ainda não roles nem concessões por módulo. Reconfirme isso antes de alterar.

- Combine **papéis**, para ações como administrar acessos, com **módulos
  habilitados**, para definir as áreas disponíveis a cada usuário.
- Nesta etapa, libere os módulos pessoais exclusivamente para a conta de
  `nandohneto@gmail.com`. Resolva essa conta no servidor e vincule a concessão
  ao seu identificador. Não confie em e-mail, role, `userId` ou permissões
  enviados pelo navegador nem permita autoatribuição no cadastro.
- Os demais usuários autorizados continuam usando somente Investimentos,
  incluindo as páginas e configurações da própria carteira. Não lhes retire
  funcionalidades existentes para restringir os módulos pessoais.
- Verifique acesso ao módulo, ação permitida e proprietário dos dados nas
  páginas, Server Actions, APIs, consultas, gravações e exportações. A
  navegação deve refletir as mesmas permissões verificadas no servidor.
- Acesso por URL direta também deve ser negado a usuários sem concessão.
- Administrar acessos não concede automaticamente leitura dos dados privados
  de outros usuários. Preserve o isolamento das carteiras e dos novos dados.
- Novas entidades pessoais precisam de escopo por usuário e relacionamentos
  compatíveis com ele. Não use o cliente Prisma sem escopo para contornar
  essa regra. Revise também rotas de backup e restauração.
- As pessoas dos lançamentos, como Sandra, são contatos do proprietário;
  não são contas de login. Compartilhamento familiar não foi solicitado para
  esta etapa.

A escolha de adotar o plugin Admin do Better Auth permanece uma decisão de
implementação a avaliar conforme a necessidade real. Não introduza permissões
amplas por padrão apenas para obter gerenciamento de roles.

## Navegação e interface

O novo pedido define **menu lateral no desktop e menu hambúrguer no celular**.
Essa direção se aplica ao trabalho futuro e substitui, neste escopo, eventuais
preferências anteriores incompatíveis sobre a navegação global.

- Organize Investimentos e Gastos familiares sob Finanças, mantendo as telas
  e os fluxos atuais de investimentos acessíveis.
- Para o proprietário, ofereça a troca entre as áreas liberadas. Para os
  amigos, a entrada permanece em Investimentos, com uma navegação dedicada
  ao que podem usar.
- No celular, use um menu que abre e fecha pelo botão hambúrguer, com foco,
  fechamento e acessibilidade corretos. Verifique larguras de 320 a 430 px.
- Separe o contexto mensal da carteira dos filtros de Gastos familiares.
  A seleção de múltiplas competências deste módulo não deve alterar o mês
  aberto dos investimentos nem criar competências da carteira.
- Reutilize o design system, tema escuro e componentes existentes. A interface
  deve ser objetiva, sem textos de andamento de specs ou explicações de
  implementação.
- Não renomeie o produto nem acrescente uma página geral de Saúde nesta etapa.

## Regras de Gastos familiares

Use a terminologia de **acerto entre pessoas**. Não transforme essa área em
um controle de orçamento, categorias de consumo ou transações de investimento.

| Campo | Regra descrita no briefing |
| --- | --- |
| Competência | Mês do lançamento, armazenado como data no dia 1; não é a data exata da compra. |
| Descrição | Texto do lançamento; preservar a descrição de origem na carga. |
| Pessoa | Contato pertencente ao proprietário, escolhido de uma entidade própria. |
| Tipo | `DEVE`: a pessoa deve ao proprietário; `DEVO`: o proprietário deve à pessoa. |
| Valor | Quantia positiva em reais, com duas casas decimais. |
| Saldo | Derivado: `DEVE` gera `+valor`; `DEVO` gera `-valor`. Não persistir como campo independente. |
| Status | `NOK`: pendente; `OK`: acertado. |

O briefing registra que o significado de `DEVE`/`DEVO` foi deduzido pela
fórmula. Trate essa interpretação como regra proposta e peça confirmação
quando a implementação for iniciada, antes de depender dela para a carga e
os rótulos. A confirmação pode ser feita sem interromper trabalhos independentes.

Use valores decimais exatos para cálculos, somas e persistência. Não calcule
dinheiro com ponto flutuante. Valide descrição, pessoa, competência, tipo,
status e valor no servidor. Inclua proprietário e campos de auditoria
adequados no modelo; o modelo sugerido no briefing não inclui o isolamento
por usuário necessário ao app.

Crie a entidade de pessoas com opção genérica `Outros`. Os nomes listados
no briefing são referência da planilha completa; não crie lançamentos ou
contas de usuário para pessoas que não aparecem no arquivo fornecido.

Não herde automaticamente as regras de mês aberto/fechado dos investimentos.
O módulo tem competências próprias. Também não deduza data de pagamento,
pagamento parcial, transferência bancária, compensação automática ou passagem
de dívida para outro mês a partir de `OK`/`NOK`.

### Lançamentos, filtros e resumos

- Permita criar, visualizar, editar e excluir lançamentos, sempre no escopo
  autorizado do proprietário.
- Implemente filtros combináveis com multisseleção de competência, pessoa,
  status e tipo. Eles devem atualizar tanto a lista quanto os resumos.
- Mostre saldo por pessoa separado em Pendente (`NOK`), Acertado (`OK`) e
  Total. Total é a soma assinada dos lançamentos resultantes dos filtros;
  não representa o valor bruto de pagamentos feitos.
- O principal indicador é o saldo líquido pendente por pessoa: positivo
  indica valor a receber, negativo indica valor a pagar. Não esconda o
  sentido do saldo atrás de um número sem identificação.
- Todos os resumos devem respeitar todos os filtros ativos, inclusive os de
  status e tipo. Não mantenha valores fora da seleção atual nos indicadores.
- Permita marcar `NOK → OK` individualmente e em lote, por exemplo para
  acertar os lançamentos selecionados de uma pessoa em um mês.
- Deixe claro quais registros serão acertados em lote. A operação deve ser
  atômica, conferir autorização de cada registro e não alcançar outras
  pessoas ou competências por acidente.
- Não presuma que o status do acerto movimenta a carteira de investimentos.

O vínculo das segmentações antigas às tabelas do Excel não foi conferido no
briefing. O requisito proposto para o app é que os filtros sejam combinados
e governem lista e resumos; a implementação não precisa adivinhar vínculos
internos da planilha.

### Recorrências e parcelas

O briefing deseja criar lançamentos recorrentes e parcelados. Antes de
implementar geração automática, defina início, duração ou término, quantidade
de parcelas, valor de cada parcela, status inicial e comportamento de edição
e cancelamento de séries. Registre essas decisões em uma spec própria.

Não gere lançamentos a partir da descrição importada: `(1/2)` pode indicar
divisão entre pessoas, além de parcelamento. Não gere parcelas ausentes,
competências futuras ou recorrências por reconhecer palavras como Spotify.
O histórico já existente não deve ser duplicado por uma série nova. A geração
autorizada deve ser idempotente, inclusive quando repetida ou executada em
paralelo. Mantenha essa fatia separada enquanto as regras estiverem pendentes.

## Dados fornecidos e limites da análise

Foi feita uma conferência estrutural do arquivo anexado, não uma revisão
financeira individual dos lançamentos nem uma nova leitura do Excel:

- 494 lançamentos de 11 pessoas: Sandra, Marcela, Martina, Papai, Outros,
  João, Diego, Luan, Gêmeas, Vovó e Bianca;
- 37 competências distintas, de outubro de 2023 a outubro de 2026;
- 338 linhas `DEVE` e 156 `DEVO`;
- 477 linhas `OK` e 17 `NOK`;
- duas duplas de linhas integralmente iguais na comparação dos sete campos;
- dois lançamentos com valor negativo, descritos abaixo;
- nenhum valor zero e nenhuma divergência entre o saldo fornecido e o
  resultado de aplicar o sinal de `DEVE`/`DEVO` ao valor de origem.

O arquivo correto tem as 494 linhas e as 11 pessoas descritas no briefing.
Ele reproduz o resumo pendente de setembro de 2026: Marcela R$ 46,00,
Martina R$ 73,90, Papai R$ 38,50, Sandra R$ 33,00 e Vovó R$ 155,00,
totalizando R$ 346,40. Em outubro de 2026, o pendente é Martina R$ 96,00,
Marcela R$ 46,00 e Sandra R$ 696,88, total de R$ 838,88. Use esses valores
para conferir a conversão, sem adicionar registros que não estejam na fonte.

### Valores negativos a resolver antes da carga

As linhas abaixo contam o cabeçalho como linha 1 no arquivo correto:

| Linha | Competência | Descrição | Pessoa | Tipo | Valor original | Saldo original | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 168 | Jul/24 | Gasolina | Marcela | DEVE | -R$ 15,28 | -R$ 15,28 | OK |
| 296 | Apr/25 | Gasolina Corolla | Sandra | DEVO | -R$ 31,50 | +R$ 31,50 | OK |

Os saldos seguem o sinal da fórmula, mas os valores negativos contradizem
o modelo proposto de valor sempre positivo. Preserve as linhas de origem e
peça uma decisão sobre sua interpretação. Não use valor absoluto, não inverta
o tipo e não descarte linhas silenciosamente. A revisão deve informar o
impacto das decisões nos totais e concluir a reconciliação antes da carga
final. Essas pendências não impedem os trabalhos independentes de interface
e autorização.

### Linhas iguais que não devem ser eliminadas automaticamente

- Linhas 328 e 329: `Aug/25 · Cigarro · Papai · DEVE · R$ 12,50 · R$ 12,50 · OK`.
- Linhas 396 e 397: `Feb/26 · Pilhas Pai · Outros · DEVE · R$ 20,00 · R$ 20,00 · OK`.

Linhas com o mesmo conteúdo podem representar compras distintas. Preserve
ambas em cada dupla, mantendo os 494 registros da fonte, salvo decisão
explícita do usuário. Idempotência da carga significa impedir que o mesmo
arquivo seja carregado novamente como outro lote; não deduplicar lançamentos
por descrição, pessoa, competência ou conteúdo. Use uma identidade de origem
que distinga as linhas do mesmo arquivo para controlar a repetição da carga.

Há ainda sequências e valores que merecem revisão em março/abril de 2024,
como `Aquecedor (4/4)` antes de `(3/4)` e valores diferentes do padrão em
Streaming e 1password. Isso não comprova erro. Não rearranje descrições e
valores nem corrija parcelas por comparação com outros meses. Uma linha de
julho de 2026 aparece entre linhas de agosto: preserve sua competência e
não a deduza pela posição no arquivo.

Preserve acentos, descrições, tipos, status e datas informados. Converta os
meses em inglês (`Oct/23`, `Apr/25` etc.) explicitamente para a competência
correta, sem depender do locale da máquina. Converta moeda brasileira com
separadores de milhar, vírgula decimal, `R$` e sinal negativo de forma exata.

## Backup e preparação da carga inicial

O app usa backup JSON como caminho oficial de entrada e saída de dados;
a importação permanente de Excel foi removida. Siga `docs/backup-format.md`
para todas as mudanças do modelo, incluindo tabelas, versão, conversões de
arquivos antigos, exportação, conferência, restauração e testes de ida e volta.

Prepare uma conversão controlada dos dados de texto para o formato oficial
quando a carga estiver autorizada. Não reintroduza uma tela de importação de
Excel nem grave diretamente na carteira real durante o desenvolvimento.

- Faça a preparação e a validação em um schema de teste.
- Preserve o arquivo original e produza relatório com contagens, competências,
  somas assinadas por pessoa/status/mês e problemas que exigem decisão.
- Reconcilie a conversão depois de resolver os dois valores negativos.
- Garanta idempotência da carga para que uma repetição não duplique o lote,
  preservando as linhas iguais que já existem dentro da fonte.
- A carga de Gastos familiares não pode apagar ou substituir posições,
  transações ou dados existentes de Investimentos. Considere o comportamento
  destrutivo da restauração atual ao definir o procedimento.
- Defina explicitamente como backups antigos, sem o novo módulo, serão
  tratados, sem apagar silenciosamente dados novos já existentes.
- Permissões administrativas e concessões por módulo não devem poder ser
  elevadas por conteúdo de um backup pessoal.
- A restauração final em dados reais, o ambiente e o momento da carga precisam
  estar no escopo autorizado pelo usuário. A preparação deste prompt não
  autoriza essa gravação.

## Critérios de aceite e verificação da execução futura

Quando houver implementação autorizada, verifique pelo menos:

1. A conta indicada acessa Investimentos e Gastos familiares; outro usuário
   acessa somente Investimentos, com a carteira própria preservada.
2. Usuários sem concessão não alcançam Gastos familiares por menu, URL,
   Server Action, API, consulta ou exportação.
3. O menu lateral e o hambúrguer funcionam com teclado e toque, sem rolagem
   horizontal entre 320 e 430 px; os fluxos atuais de investimentos continuam
   utilizáveis.
4. Os lançamentos calculam o sinal corretamente e persistem dinheiro com
   precisão decimal. Valores inválidos são recusados no servidor.
5. Combinações e multisseleções dos quatro filtros produzem os mesmos totais
   na listagem e nos resumos, inclusive seleção sem resultados.
6. Os acertos individuais e em lote afetam exatamente os registros escolhidos
   e não misturam dados de pessoas ou usuários distintos.
7. Backup, conversão de versões antigas e restauração preservam os dados e
   o isolamento, incluindo ida e volta do novo módulo.
8. A conversão reconcilia os 494 registros do arquivo correto e os resumos
   pendentes de setembro/outubro de 2026. As duplas iguais são preservadas e
   os valores negativos só recebem tratamento decidido pelo usuário; nenhuma
   correção, parcela ou lançamento ausente é criado por suposição.
9. Se recorrências e parcelas forem implementadas, repetição da geração e
   edição/cancelamento de séries seguem as regras previamente definidas.

Use testes relevantes em schema isolado, conforme as instruções do projeto,
para autorizações, cálculos, gravações e backup. Os dados reais ficam
preservados. Execute os checks apropriados e registre os resultados nas specs.
Ao entregar, informe o que foi concluído, o que depende de decisão e se houve
carga de dados; não apresente preparação como funcionalidade já implementada.
