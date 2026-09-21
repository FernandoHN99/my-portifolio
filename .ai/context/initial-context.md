# Contexto inicial

Registrado em: 2026-09-21
Origem: conversa de descoberta com o usuário.
Estágio: entendimento do sistema existente e preparação da estrutura
de contexto; nenhuma feature implementada.

## Projeto e objetivo

O projeto é um sistema pessoal de finanças atualmente baseado no
arquivo `01-Investimentos.xlsm`, localizado na raiz.

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

PostgreSQL e Docker foram sugeridos pelo usuário.
TypeScript e outras opções foram discutidos como candidatos.
A composição final da stack permanece aberta, além da direção
de migrar para Next.js.

## Trabalho realizado

O usuário inicializou o repositório Git. As convenções de commits
estão em [Fluxo de Git e commits](../../docs/git-workflow.md).

Foi realizada análise estática das abas, tabelas, fórmulas,
tabelas dinâmicas, gráficos, segmentações e código VBA.

O diagnóstico e suas limitações estão em `excel-analysis.md`.
Os achados não constituem autorização para corrigir a planilha
nem decisões sobre como reproduzir cada comportamento no app.

## Questões em aberto

- Tratamento das inconsistências encontradas no Excel.
- Regras definitivas de identidade dos investimentos e instituições.
- Comportamento pretendido dos percentuais e metas relacionados.
- Preservação e eventual correção do histórico.
- Arquitetura, persistência, execução local e futura hospedagem.
- Fontes de cotações e tratamento de indisponibilidade.
- Interface, organização do código e sequência das futuras specs.
- Validação do comportamento das macros e da interface no Excel.

## Escopo da etapa atual

Estabelecer e revisar a fundação documental compartilhada.
Não implementar features nem criar specs de funcionalidades
ainda não definidas.

Quando o usuário autorizar uma nova etapa, atualizar este registro
e os documentos relacionados para refletir o novo estado.
