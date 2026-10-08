# 096 — Faixa de competência compartilhada e átomos com tailwind-variants

Estado: implementada, commitada e publicada em 2026-10-08 (deploy
`dpl_4f2NDoKcF8nmQsX4KD89BRFRGnRA`), com autorização do usuário.
Origem: pedido do usuário depois da spec 090: pôr a Competência de Gastos
familiares no alto da página, reaproveitando o componente de Investimentos, mas
com seleção múltipla; melhorar o uso no celular sem mudar a estética; e usar
`tailwind-variants` em todo componente atômico para manter o padrão.

## Decisões

1. **Uma faixa só.** O desenho e o toque da faixa de competências saíram do
   `MonthTimeline` para `src/components/product/month-strip.tsx` (`MonthStrip`).
   Ela só desenha e responde ao toque; o significado da seleção é de quem a usa:
   - `MonthTimeline` (Investimentos) continua com `?mes=`, as setas do teclado,
     o aviso de alterações não salvas e a situação do mês (`MonthLock`) à direita;
   - `FamilyMonthBar` (Gastos familiares, `family-month-bar.tsx`) usa
     `?competencia=` e `?multimes=`, com os anos de qualquer lançamento, o mês
     atual e os escolhidos, e as setas do teclado no modo de um mês.
2. **Gastos familiares.** A faixa fica fixa no alto da página (`sticky`), como na
   Visão Geral, com as cápsulas de ano e, no ano aberto, os doze meses. Saiu o
   bloco "Competência" de dentro da página e o grupo Competência dos filtros
   (menu do computador e folha do celular): a faixa é o único controle de mês.
   Pessoa, status, tipo e busca ficam como estavam. Os meses com pendência da
   pessoa escolhida levam uma barra em `warning` e o nome acessível
   "…, com pendências" (a marca não depende só da cor).
3. **Seleção múltipla.** O seletor "Selecionar vários meses" fica à direita da
   faixa (`MultiMonthToggle`, no lugar do `MonthLock`), com o texto "Vários
   meses" no computador e, com vários meses marcados, o número deles. Os botões
   dos meses viram marcações (`aria-pressed`), e a faixa fica no ano em que o
   usuário está marcando, sem pular para outro ano quando o último mês mudar. No
   modo de um mês, o botão selecionado leva `aria-current="date"`, como na Visão
   Geral. As regras de `selectCompetence` não mudaram: tirar o último mês volta
   ao atual, e sair do modo múltiplo guarda o último mês.
4. **Celular, sem mudar a estética.** Só valem em telas de toque
   (`pointer-coarse`), então o computador fica igual:
   - alvos de 44 px (eram 40) para ano, mês e seletor, e 4 px entre os meses (eram 2);
   - `touch-manipulation` e `select-none`: sem atraso nem zoom no toque duplo e
     sem selecionar o texto do botão;
   - retorno visual ao pressionar o mês;
   - ao marcar vários meses seguidos, a faixa não recentraliza a cada toque (só
     anda quando o mês sai da vista), para os botões não fugirem do dedo;
   - o número de meses marcados no seletor, para quem rolou a faixa e não vê todos.
5. **tailwind-variants nos átomos.** Dependências novas: `tailwind-variants` e
   `tailwind-merge` (par exigido por ele). Passaram para `tv`: `KpiCard`
   (tom, `dense`, `emphasis`), `Badge` (novo, `components/product/badge.tsx`,
   tons `primary`, `spent`, `accent`, `warning`, `neutral`), `filterBadge` e
   `headerButton` (`page-controls.ts`; `headerPrimaryButtonClass` agora sai
   dele), as peças da faixa (cápsula do ano, mês, marca, tique, seletor) e o
   `Button` de `components/ui` (antes `class-variance-authority`, que saiu do
   `package.json`). Regra: átomo novo ou alterado usa `tv`, com as classes
   completas nas variantes, para o Tailwind encontrá-las; o resto migra quando
   for tocado.

## Critérios de aceite

1. Investimentos: a faixa continua igual (anos, meses, marcas de alta e queda,
   `aria-current`, descrição do ano fechado, teclado, trava do mês).
2. Gastos familiares: faixa fixa no alto, ano inteiro, mês atual por padrão,
   mês único ou vários, URL com `competencia` e `multimes`, pessoas abaixo da
   faixa e sem o bloco antigo de Competência.
3. Sem rolagem lateral da página entre 320 e 430 px; a rolagem fica na faixa.
4. Nenhuma mudança de cálculo, dados, rotas, backup ou migrações.

## Verificação

- Lint, tipos e 91 testes unitários (inclui `formatCompetenceMonth`).
- Interface em Chrome, Android e iPhone/WebKit: Gastos familiares, Recebimentos
  e Previdência no servidor de teste (44 aprovados, 14 pulados por falta de dados
  ou de permissão do usuário de teste), com o cenário novo da faixa no alto,
  meses únicos e múltiplos e o contador; Investimentos no servidor normal (130
  aprovados, 18 pulados), com a linha do tempo, a Visão Geral, a posição e o
  iPhone.
- Conferência no navegador em 375 e 1440 px: faixa no alto de Gastos familiares,
  dois meses marcados com o contador no celular, alvos de 44 px medidos.
