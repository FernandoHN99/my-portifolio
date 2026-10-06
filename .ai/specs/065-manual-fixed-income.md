# 065 — Renda fixa por movimentações manuais

Estado: implementada e validada localmente em 2026-10-04; sem deploy.
Definida em: 2026-10-04, ajustes 4 e 8 do usuário.

**Substituída em 2026-10-06:** a [spec 079](079-auto-income-prefixed-and-movement-filters.md)
trocou a pausa global por uma flag em cada ativo. Sem a flag, o comportamento
abaixo continua valendo.

## Decisão

O usuário suspendeu o cálculo bruto automático de aplicações de renda fixa
para priorizar o diálogo de aportes, retiradas e rendimentos. A Selic será
informativa ([spec 064](064-selic-and-dev-quotes.md)), sem remunerar
caixa ou aplicações. Esta decisão substitui o comportamento ativo da
[spec 060](060-cdi-fixed-income.md); sua calculadora e os dados persistidos
continuam disponíveis para uma retomada futura explicitamente definida.

## Comportamento

- `AUTOMATIC_FIXED_INCOME_ENABLED = false`, em
  `domain/fixed-income-policy.ts`, bloqueia a busca de CDI e a avaliação antes
  de qualquer consulta ao banco ou ao provedor. O job, a edição, o clone e a
  virada de mês não acrescentam juros automaticamente.
- A posição de renda fixa usa o saldo conhecido e as movimentações do mês.
  Rendimento informado pelo usuário entra como `INCOME`, sem juros futuros
  calculados ou projeção na interface.
- Um rendimento automático já salvo permanece congelado em
  `calculatedIncomeBrl`. O recálculo soma **base + movimentações + rendimento
  automático anteriormente salvo**, uma única vez. O saldo em reais é
  arredondado a centavos; não se inventa uma nova transação para converter o
  passado.
- `calculationStartDate`, `cdiPercent`, `appliedOn`, a última taxa usada e os
  erros registrados ficam preservados. Mesmo um formulário antigo que envie
  `cdiStartDate: null` ou `cdiPercent: null` não limpa esses metadados nem
  fabrica um rendimento registrado durante a pausa.
- A inclusão não ativa cálculo por CDI. A configuração de cálculo e as
  projeções saem da interface; os rendimentos anteriores continuam no
  histórico. As alterações visuais pertencem ao ajuste do fluxo de posições.
- A retirada total e a liquidação consideram o saldo disponível, incluindo
  juros anteriormente calculados. A liquidação zera o título, credita o caixa
  uma vez e remove suas pernas juntas, inclusive acerto positivo ou negativo.
- O mês novo herda o saldo final congelado como sua base, sem copiar as
  movimentações ou os juros separados do mês anterior. Correções continuam
  atingindo somente a competência aberta.

## Dados e compatibilidade

Não há migração, reescrita de saldos reais ou alteração de formato do backup.
Os campos da spec 060 e as tabelas de taxas são preservados. O backup atual
continua exportando/restaurando saldo, movimentos e metadados existentes.

## Critérios de aceite

- execução do job não consulta CDI nem muda o saldo de aplicações;
- editar atributos não altera rendimentos anteriores;
- aporte, retirada, rendimento, correção e exclusão funcionam sobre o saldo
  congelado;
- retirada total e liquidação não deixam os juros anteriores para trás;
- liquidação com valor recebido diferente do saldo mantém coerência entre
  título e caixa e pode ser excluída atomicamente;
- backup e virada de mês preservam o saldo, sem duplicar rendimento;
- nenhum mês posterior já existente muda por correção anterior.

## Verificação

`scripts/test-manual-fixed-income.ts`, executado com Node 24.20.0 no schema
isolado `manual_fixed_income_065`, nunca em `public`:

- métodos CDI receberam um cliente que falha ao acessar qualquer dependência;
  todos retornaram sem consultas;
- base de R$ 1.000 e rendimento prévio de R$ 20,301 preservaram R$ 1.020,30;
  aporte de R$ 500 e rendimento manual de R$ 50 resultaram em R$ 1.570,30;
  corrigir o aporte para R$ 1.000 resultou em R$ 2.070,30;
- retirada e exclusão recalcularam apenas o mês, e retirada excessiva foi
  recusada sem gravar; retirada total zerou e sua exclusão restaurou o saldo;
- edição de atributos com campos CDI antigos nulos preservou percentual,
  datas, juros anteriores e apenas o rendimento manual existente;
- liquidações pelo saldo, abaixo e acima dele zeraram o título e creditaram o
  caixa; repetição foi recusada e exclusão restaurou as duas posições;
- exportação/restauração do backup manteve os campos; novembro herdou
  R$ 2.070,30 de base, rendimento automático zero e nenhuma transação copiada;
- `pnpm typecheck` passou.

O schema é exclusivamente de teste e cada execução cria/remove seu próprio
usuário. Um aviso de depreciação do driver `pg` sobre consultas concorrentes
foi observado; não impediu as verificações.
