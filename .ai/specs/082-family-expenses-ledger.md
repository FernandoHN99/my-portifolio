# 082 — Gastos familiares: lançamentos, filtros, resumo e acerto

Estado: concluída localmente em 2026-10-07; aguarda aprovação de commit e
deploy.
Origem: pedido do usuário em 2026-10-07 ("página simples, com a tabela bem
próxima do Excel, com toda a automação"); requisitos no
[prompt de continuidade](../context/gastos-familia-prompt.md).

## Respostas do usuário (2026-10-07)

- **Tipo confirmado:** DEVE = a pessoa me deve (saldo +, a receber); DEVO = eu
  devo à pessoa (saldo −, a pagar).
- Parcelas e recorrências, valores negativos e carga: [spec 083](083-family-expense-series.md)
  e [spec 084](084-family-expenses-backup-and-load.md).

## Modelo

`family_contacts` (pessoas, contatos do dono, não contas de login),
`family_entries` (lançamentos) e `family_series` (spec 083), todas com
`user_id`, chaves estrangeiras compostas com o usuário e no cliente com escopo
(`OWNED_MODELS` em `src/lib/user-db.ts`).

| Campo | Regra |
|---|---|
| `competence` | DATE no dia 1; competência própria da área, sem aberto/fechado |
| `description` | texto de até 120 caracteres, preservado na carga |
| `contact_id` | pessoa do usuário; "Outros" é oferecida como opção genérica |
| `direction` | `RECEIVABLE` (DEVE) ou `PAYABLE` (DEVO) |
| `amount` | DECIMAL(12,2), `CHECK amount > 0` |
| `status` | `PENDING` (NOK, Pendente) ou `SETTLED` (OK, Acertado) |
| saldo | derivado: +valor no DEVE, −valor no DEVO; nunca guardado |

Dinheiro anda em centavos inteiros fora do banco (`domain/money.ts`): somas,
filtros e resumos exatos, sem ponto flutuante. O servidor valida tudo de novo
(Zod nas actions; centavos > 0 e ≤ R$ 9.999.999,99).

## Interface (`/gastos-familiares`, uma página)

Revisão visual e dos filtros pedida depois da entrega inicial:
[spec 085](085-family-ledger-and-navigation-polish.md) e
[spec 086](086-family-person-and-month-selection.md).

- cabeçalho fixo simples com Finanças; título Gastos familiares, contagem, Pessoas, Backup e
  "Novo lançamento" (atalho `n`);
- filtros na URL (`competencia`, `pessoa`, `status`, `tipo`, `q`), cada um
  com pessoa única, mês atual automático e meses únicos ou múltiplos (spec 086);
  dependência competência → pessoa → status → tipo; os seis meses à vista (o atual, os
  anteriores e até dois próximos) como a segmentação da planilha, listas no
  computador e folha no celular (a da spec 077, generalizada);
- indicadores: saldo pendente (com "a receber"/"a pagar" escrito), a receber,
  a pagar e acertado; zero fica neutro;
- pessoa escolhida por badges alfabéticos ou pelo filtro Pessoa; a primeira
  disponível vem selecionada. O quadro de saldo por pessoa saiu na spec 086;
  os cards bastam para os saldos da pessoa única;
- lista agrupada por mês, sem checkboxes nem cabeçalho de colunas (spec 085),
  com descrição, pessoa, tipo, saldo calculado e status, além do subtotal
  pendente do mês; tocar na linha edita;
- tudo — indicadores, lista e rodapé — vem do mesmo
  conjunto filtrado, inclusive status e tipo, e zera junto sem resultados;
- acerto: o ✓ da linha acerta um; “Acertar pendentes” nos filtros abre a
  confirmação, que lista cada lançamento por
  pessoa e mês com o saldo do lote. O servidor acerta todos ou nenhum: um id
  de outro usuário, inexistente ou já acertado desfaz o lote. Desfazer volta
  os mesmos ids a Pendente;
- excluir fica no formulário, com Desfazer; Pessoas renomeia, inclui e exclui
  (só sem lançamentos);
- cores revisadas na spec 085: verde primário para receber, tom de atenção
  para pagar; o sentido sempre vem escrito. Nada de textos de andamento.

## Critérios de aceite

1. Sinal correto e dinheiro exato; valores inválidos recusados no servidor.
2. Combinações dos quatro filtros dão os mesmos totais na lista e nos
   resumos, inclusive seleção sem resultados; a spec 086 limita pessoa
   a uma seleção e oferece modo único ou múltiplo para competências.
3. Acertos individual e em lote afetam exatamente os escolhidos, sem misturar
   pessoas ou usuários.
4. Criar, ver, editar e excluir no escopo do dono.

## Verificação

- `tests/unit/family-expenses.test.ts`: 9 cenários (dinheiro, competência,
  filtros, resumo, séries, leitura da planilha e conferência do arquivo real).
- `tests/integration/family-expenses.test.ts`: 9 cenários no schema
  `gastos_familiares_teste` (acesso, pedido repetido e simultâneo, CHECK do
  banco, isolamento entre usuários, lote atômico e desfazer, séries, backup,
  carga reconciliada).
- Navegador (servidor de teste com a carga convertida): Out/26 filtrado deu
  Sandra R$ 696,88, Martina R$ 96,00 e Marcela R$ 46,00, total R$ 838,88; Set/26
  deu Marcela R$ 46,00, Martina R$ 73,90, Papai R$ 38,50, Sandra R$ 33,00 e Vovó
  R$ 155,00, total R$ 346,40, iguais ao briefing. O acerto da Martina em Set/26
  listou os dois lançamentos (R$ 73,90), baixou o pendente para R$ 272,50, e o
  Desfazer voltou a R$ 346,40.
- E2E: filtros e totais coincidentes, seleção sem resultado zerando tudo.
