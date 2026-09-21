# Contexto compartilhado dos agentes

Esta pasta centraliza o contexto de trabalho dos agentes.
Os entrypoints indicam como chegar a esse conhecimento.

## Onde consultar

- `context/initial-context.md`: objetivos, estágio, orientações
  do usuário e questões em aberto.
- `context/excel-analysis.md`: diagnóstico do sistema existente,
  evidências e limitações da análise.
- `specs/README.md`: finalidade e evolução das futuras specs.
- `../docs/README.md`: organização da documentação para humanos.

Leia primeiro o contexto inicial e depois apenas os assuntos
necessários à tarefa. Não carregue toda a documentação sem necessidade.

## Fonte de verdade por assunto

- Descobertas ainda em elaboração ficam em `context/`.
- Demandas definidas e seu acompanhamento ficam em `specs/`.
- Documentação funcional, técnica e decisões arquiteturais destinadas
  a humanos podem ter sua fonte principal em `docs/`.
- O código e a planilha são evidências do comportamento existente;
  specs e decisões registram o comportamento pretendido.

Quando um assunto servir a humanos e agentes, mantenha uma fonte
principal e faça os outros documentos apontarem para ela.

Ao consolidar uma descoberta em uma spec ou documento, substitua
o conteúdo anterior por uma referência e preserve a origem e o
estado da decisão. Não mantenha duas versões ativas da mesma regra.

## Manutenção do contexto

Registre fatos relevantes, decisões expressas pelo usuário e questões
ainda abertas. Informe a fonte e a data quando isso ajudar a verificar
o registro. Não copie conversas inteiras nem apresente hipóteses como fatos.

Atualize o estado existente quando ele mudar. Se documentos, código
ou planilha divergirem, registre a diferença antes de assumir qual
comportamento deve prevalecer na aplicação.

Memórias particulares das ferramentas não substituem o contexto
compartilhado. Conhecimento relevante para o projeto deve ser
registrado aqui ou referenciado à sua fonte principal.

## Extensões futuras

Skills, agentes, workflows, templates e automações serão adicionados
quando houver necessidade concreta.

Preserve os formatos e locais de descoberta exigidos por cada
ferramenta. Quando esses recursos precisarem de conhecimento do
projeto, faça-os consultar a fonte compartilhada correspondente.

Uma pasta em `.ai/` não é automaticamente reconhecida como mecanismo
nativo por Codex, Claude Code ou outras ferramentas.
