# Contexto inicial

Registrado em: 2026-09-21
Última atualização: 2026-10-02 (nota da spec 022)
Origem: conversa de descoberta com o usuário.
Estágio: implementação incremental autorizada, começando pela fundação
técnica; nenhuma funcionalidade financeira concluída ainda.

## Projeto e objetivo

O projeto é um sistema pessoal de finanças atualmente baseado no
arquivo `raw_file/01-Investimentos.xlsm`.

O Excel passou a apresentar limitações de manutenção e controle.
O usuário quer migrar o sistema para uma aplicação web, obtendo
maior flexibilidade, controle e capacidade de evolução.

Next.js é a base pretendida para a aplicação. A intenção expressa
é substituir todas as funcionalidades relevantes da planilha.

A análise do Excel deve orientar a definição do sistema antes de
fecharmos decisões de arquitetura e negócio.

## Desenvolvimento e contexto compartilhado

O desenvolvimento será AI-first, utilizando Codex e Claude Code.

A estrutura compartilhada usa:

- `AGENTS.md` na raiz como entrada principal.
- Futuros `AGENTS.md` locais quando áreas reais do projeto
  precisarem de contexto próprio.
- Um único `CLAUDE.md`, na raiz, como entrada do Claude Code.
- `.ai/` como camada central de contexto para agentes.
- `.ai/context/` para descoberta e arquitetura em elaboração.
- `.ai/specs/` para futuras demandas e features definidas.
- `docs/` para documentação tradicional destinada a humanos.

As regras de navegação estão no AGENTS.md da raiz.
A manutenção e a responsabilidade de cada fonte estão em
`../README.md`.

## Preferências anteriormente manifestadas

Antes de solicitar a análise completa do Excel, o usuário indicou:

- Uso local primeiro.
- Substituição completa da planilha.
- Cotações automáticas.
- Preferência por fontes gratuitas e atualização diária.
- Preservação da lógica existente como ponto de partida.

Depois, pediu que a análise integral precedesse as decisões.
Essas preferências são contexto para retomar a discussão, não uma
arquitetura final aprovada.

As escolhas confirmadas estão em
[Decisões de arquitetura e funcionamento](../../docs/architecture.md),
fonte principal para o estado atual dessas decisões.

## Trabalho realizado

O usuário inicializou o repositório Git. As convenções de commits
estão em [Fluxo de Git e commits](../../docs/git-workflow.md).

Foi realizada análise estática das abas, tabelas, fórmulas,
tabelas dinâmicas, gráficos, segmentações e código VBA. Em
2026-10-01, a versão colocada em `raw_file/` foi comparada com a
versão anteriormente registrada no Git. Os dados-base e as fórmulas
permanecem equivalentes, mas os caches dos pivôs foram atualizados.

Os oito módulos exportados em `raw_file/automacaoVBA/` também foram
lidos integralmente. A análise detalhada está em `vba-analysis.md`.

O diagnóstico e suas limitações estão em `excel-analysis.md`.
Os achados não constituem autorização para corrigir a planilha
nem decisões sobre como reproduzir cada comportamento no app.

Em 2026-10-01, a implementação foi iniciada conforme as specs:

- a [spec 001](../specs/001-foundation.md) foi concluída com Next.js,
  TypeScript, PostgreSQL 18 no Docker, Prisma 7, shadcn/ui e Playwright;
- Node.js 24.20.0 foi fixado porque o Prisma 7 não oferece suporte ao
  Node.js 26 encontrado inicialmente no ambiente;
- a [spec 002](../specs/002-excel-import.md) está em andamento;
- a primeira importação preservou 904 linhas das três tabelas-base e
  registrou 14 achados iniciais, sem alterar o XLSM;
- uma segunda execução confirmou idempotência pelo hash do arquivo;
- a normalização adicionou 2 achados de duplicidade exata e produziu 31
  competências, 12 instituições, 12 contas, 62 ativos, 362 posições e 156
  cotações;
- a visão geral apresenta o patrimônio real, evolução, moedas, posições e
  instituições; a revisão dos 16 achados possui rota própria.
- a atualização mensal manual possui rascunho idempotente, provedores de
  cotações isolados, registro por símbolo e aplicação atômica dos preços;
- em 2026-10-02 a [spec 022](../specs/022-quotes-page.md) removeu a rota de
  revisão da importação e o fluxo e a tela da atualização mensal manual; os
  achados e as execuções continuam nas tabelas de importação e em
  `monthly_update_runs`, e as cotações passaram a ser editadas e atualizadas
  na página de cotações de Posições;
- a atualização real de outubro de 2026 concluiu as 10 cotações previstas;
  as credenciais permanecem somente no `.env` local ignorado pelo Git.
- a competência em rascunho permite editar quantidades cotadas e saldos
  manuais com validação e recálculo decimal atômico no servidor;
- as classificações de `Table_Investimentos_Porcent` foram normalizadas por
  posição e as seis famílias de metas de `Tables_Atual_Ideal` foram
  importadas com planilha e célula de origem; correspondências ambíguas por
  instituição permanecem como achados, sem escolha automática; novos
  rascunhos recebem as classificações do mês anterior por identidade de
  conta e ativo.

## Questões em aberto

- Tratamento das inconsistências encontradas no Excel.
- Correspondência dos demais casos ambíguos da importação. A identidade-base
  já foi definida: o mesmo ativo em instituições ou contas diferentes mantém
  posições separadas e só é agregado em relatórios.
- A posição inconsistente de Bitcoin de junho de 2023 recebeu, por resposta do
  usuário em 2026-10-03, a quantidade de julho de 2023 no histórico preparado
  da [spec 041](../specs/041-history-preparation.md).
- Instituição e conta são entidades distintas; uma instituição pode ter várias
  contas e cada posição pertence a uma conta.
- Comportamento pretendido dos percentuais e metas relacionados.
- Preservação e eventual correção do histórico.
- Fontes gratuitas de cotações, limites e tratamento de indisponibilidade.
- Hospedagem futura, fora do escopo local atual.
- Validação do comportamento das macros em execução e da interface
  diretamente no Excel.

## Direção visual confirmada

A aplicação terá somente tema escuro e deverá transmitir a linguagem de uma
fintech moderna, premium e confiável. A interface deve priorizar clareza,
acabamento e confiança, sem inventar dados financeiros para fins decorativos.

O usuário pediu explicitamente que a aplicação não gaste interface descrevendo
o que já foi feito, o que falta ou as pendências de desenvolvimento. Esse
acompanhamento deve ficar na conversa e em `.ai/`. A estilização e o espaço do
produto são reservados às funcionalidades financeiras.

## Escopo da etapa atual

Implementar o sistema em fatias pequenas registradas em `.ai/specs/`.
A primeira fatia estabelece Next.js, PostgreSQL local, persistência,
interface-base e verificações. As etapas seguintes importam o Excel e
reproduzem a atualização mensal manual antes das análises avançadas.

A [spec 008](../specs/008-allocation-view.md) foi concluída em 2026-10-01: a
rota `/alocacao` apresenta a alocação atual da competência mais recente ao
lado da meta vigente, nas seis famílias da spec 007.

Em 2026-10-01 o usuário pediu uma reestruturação da UX, comparando o app com
a planilha e registrando o propósito do produto: percorrer o histórico mês a
mês e saber o que fazer na prática. A direção está em
[Decisões de arquitetura](../../docs/architecture.md) e a execução foi
dividida em fatias a partir da [spec 010](../specs/010-global-shell-month-selector.md),
entregue com a navegação no topo e o seletor global de mês. Previdência
permanece fora de todas essas fatias por decisão explícita do usuário.

A [spec 009](../specs/009-rebalance-labels.md) foi concluída em 2026-10-01:
cada linha com meta na tela de alocação recebe o rótulo comprar/vender e o
valor em BRL da diferença, preservando a regra diagnosticada no Excel
(diferença positiva vende; zero ou negativa compra). Nenhuma ordem é
executada e nenhum ativo específico é sugerido.

Quando o usuário autorizar uma nova etapa, atualizar este registro
e os documentos relacionados para refletir o novo estado.
