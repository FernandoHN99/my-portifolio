# Fluxo de Git e commits

## Aprovação do usuário

Agentes só podem executar commits quando o usuário aprovar
explicitamente. Permissão para implementar ou editar arquivos não
equivale a permissão para fazer commit.

A aprovação vale para o commit ou conjunto de commits autorizado.
Não a estenda a mudanças futuras fora desse escopo. Se a aprovação
já foi dada para o trabalho em questão, não peça novamente.

Antes de solicitar aprovação, conclua o trabalho e as verificações
pertinentes e apresente o escopo e a mensagem proposta. Sem aprovação,
deixe as alterações disponíveis para revisão, sem executar o commit.

## Mensagens

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
tipo: descrição
tipo(escopo): descrição
```

O escopo é opcional. Use uma descrição curta e concreta, com um
espaço após os dois-pontos. Escolha o tipo conforme a mudança:

- `feat`: nova funcionalidade.
- `fix`: correção de comportamento.
- `docs`: documentação e contexto do projeto.
- `refactor`: reorganização sem alterar o comportamento.
- `test`: testes.
- `chore`: manutenção e tarefas auxiliares.
- `build` ou `ci`: construção, dependências ou integração contínua.
- `perf`: melhoria de desempenho.
- `style`: formatação sem mudança de comportamento.

Exemplos:

```text
docs: estrutura contexto compartilhado dos agentes
docs: define regras de aprovação e mensagens de commit
feat(carteira): adiciona consulta de posições mensais
fix(cotacoes): corrige conversão de moeda
```

Quando houver incompatibilidade, sinalize com `!` antes dos
dois-pontos ou com um rodapé `BREAKING CHANGE: descrição`.

## Organização do histórico

Mantenha cada commit focado em uma mudança coerente. Separe assuntos
independentes quando isso facilitar a revisão e o entendimento do
histórico. Revise os arquivos e o diff que entrarão no commit para
incluir somente o conteúdo autorizado.
