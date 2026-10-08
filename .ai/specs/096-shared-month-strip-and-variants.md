# 096 — Seletor de competência com vários meses e átomos com tailwind-variants

Estado: a primeira versão (faixa no alto de Gastos familiares) foi publicada em
2026-10-08 (deploy `dpl_4f2NDoKcF8nmQsX4KD89BRFRGnRA`). A revisão com o
`YearMonthPicker` e a folha de competência de Investimentos no celular (item 3)
estão na `dev`, conferidas localmente, sem publicação.
Origem: pedido do usuário depois da spec 090: padronizar a Competência de
Gastos familiares com a de Investimentos, mas com seleção múltipla; melhorar o
uso no celular sem mudar a estética; e usar `tailwind-variants` em todo
componente atômico. Revisado no mesmo dia: o usuário não gostou da faixa no alto
de Gastos familiares e pediu o seletor embaixo do título, com os anos e os
meses do ano.

## Decisões

1. **Faixa de Investimentos, só dela.** O desenho e o toque da faixa de
   competências saíram do `MonthTimeline` para
   `src/components/product/month-strip.tsx` (`MonthStrip`), e o `MonthTimeline`
   ficou com a URL (`?mes=`), o teclado, o aviso de alterações não salvas e a
   situação do mês (`MonthLock`). A primeira versão desta spec também levou essa
   faixa, fixa no alto, para Gastos familiares com seleção múltipla; o usuário
   não gostou e pediu o seletor abaixo do título (item 2). O código de seleção
   múltipla da faixa saiu junto.
2. **Gastos familiares: `YearMonthPicker`** (`components/product/year-month-picker.tsx`).
   Fica entre o título e os cartões, como o seletor de ano de Recebimentos:
   - um cartão só: os anos num controle com um marcador que desliza e, embaixo,
     a régua dos doze meses do ano aberto. Os anos vão do mais recente ao mais
     antigo (2026, 2025, 2024…), como nos selos de ano de Recebimentos e
     Previdência, e os meses, de Jan a Dez (o usuário testou a ordem
     cronológica nos dois e preferiu esta). Meses seguidos
     marcados viram uma faixa contínua, como um intervalo; os meses ficam
     sempre embaixo dos anos, em qualquer largura, para a leitura ser uma
     hierarquia (ano, depois mês) a régua tem o tamanho do conteúdo, como o controle
     dos anos (doze células de 48 × 36 px, que só encolhem num cartão mais
     estreito), em vez de esticar na largura do cartão;
   - **celular (abaixo de `sm`):** um botão de uma linha, "Competência" e o
     resumo da seleção ("Set/26", "Ago/26, Set/26", "2026 inteiro", "5 meses"),
     abre a mesma escolha numa folha de baixo para cima, como os filtros, com
     anos e meses de 44 px (quatro meses por linha) e o botão "Ver N
     lançamentos"; com um mês só, a folha fecha ao escolher; com vários, fica
     aberta até confirmar;
   - um mês por vez ou vários, de qualquer ano (`?competencia=` e `?multimes=`):
     trocar de ano só muda os meses na tela, a seleção continua onde estava, e o
     ano que guarda meses marcados leva um ponto e, no nome acessível, quantos;
   - "Ano todo" marca os doze meses do ano aberto de uma vez (e passa ao modo de
     vários meses) ou, com todos marcados, os desmarca; sem nenhum mês marcado,
     volta ao atual;
   - "Vários meses" alterna o modo e mostra quantos meses estão marcados;
   - mês com pendência da pessoa escolhida leva um ponto de atenção e o nome
     acessível "…, com pendências"; mês sem lançamentos continua escolhível;
   - saiu o grupo Competência dos filtros (menu do computador e folha do
     celular); pessoa, status, tipo e busca ficam como estavam.
3. **Investimentos: faixa no computador, folha no celular.** O computador
   (de `sm` para cima) fica como era. Em telas de toque largas (tablet) a faixa
   ganha só alvos de 44 px (eram 40) e 4 px entre os meses (eram 2),
   `touch-manipulation` e `select-none` (sem atraso nem zoom no toque duplo) e
   retorno visual ao pressionar (`pointer-coarse`). **Abaixo de `sm`** a faixa
   some: rolar entre cápsulas de ano e meses pequenos não funcionava no celular
   (o usuário pediu, em 2026-10-08, que se adaptasse como os filtros). No lugar,
   `MonthSheet` (`components/product/month-sheet.tsx`, dentro do `MonthStrip`):
   - um botão de uma linha, com o calendário, o mês escolhido ("Set/26") e a seta,
     ao lado da situação do mês (`MonthLock`); nome acessível "Competência:
     Setembro de 2026"; na faixa restrita a uma posição leva o destaque da trilha;
   - ele abre a `BottomSheet`, sem rodapé: os anos (do mais recente ao mais
     antigo, como nas outras áreas) e os doze meses do ano em quatro colunas, com
     a marca de alta ou de queda sob cada mês, a mesma da faixa; mês sem registro
     fica apagado e desabilitado, para a grade ter sempre a mesma forma;
   - um mês por vez: escolher o mês navega (`?mes=`) e fecha a folha; trocar de ano
     só consulta (o ano que guarda a competência leva um ponto) e, ao reabrir, a
     folha volta ao ano dela; as alterações não salvas seguram a troca de mês, como
     na faixa;
   - sem setas de mês anterior e próximo na tela (spec 034): a decisão vale para o
     celular também.
   `BottomSheet` ganhou o `footer` opcional (a folha de um toque só não precisa de
   botão de confirmar). Os testes passam pelo `support/competence.ts`, que sabe
   conferir e trocar a competência na faixa ou na folha.
4. **Folha única.** A folha de baixo para cima dos filtros de Posições saiu de
   `positions-filter-sheet.tsx` para `components/product/bottom-sheet.tsx`
   (`BottomSheet`, `BottomSheetTrigger`, `BottomSheetClose`, `sheetButton`), em
   `tailwind-variants`; os filtros de Posições e de Gastos familiares e a
   competência abrem a mesma peça. Sem mudança de comportamento nos filtros.
5. **tailwind-variants nos átomos.** Dependências novas: `tailwind-variants` e
   `tailwind-merge` (par exigido por ele). Passaram para `tv`: `KpiCard`
   (tom, `dense`, `emphasis`), `Badge` (novo, `components/product/badge.tsx`,
   tons `primary`, `spent`, `accent`, `warning`, `neutral`), `filterBadge`
   (`active` e `marked`), `headerButton` (`page-controls.ts`;
   `headerPrimaryButtonClass` agora sai dele), as peças da faixa e do
   `YearMonthPicker` a folha e o `Button` de `components/ui` (antes
   `class-variance-authority`, que saiu do `package.json`). Regra: átomo novo ou
   alterado usa `tv`, com as classes completas nas variantes, para o Tailwind
   encontrá-las; o resto migra quando for tocado.

## Critérios de aceite

1. Investimentos: no computador a faixa continua igual (anos, meses, marcas de
   alta e queda, `aria-current`, descrição do ano fechado, teclado, trava do mês);
   no celular, o botão com o mês e a folha de anos e meses, sem rolagem lateral
   da página a partir de 320 px.
2. Gastos familiares: seletor embaixo do título e acima dos cartões, mês atual
   por padrão, mês único ou vários, "Ano todo", URL com `competencia` e
   `multimes`, pessoas abaixo dos cartões.
3. Sem rolagem lateral da página entre 320 e 430 px; no celular, o seletor ocupa
   uma linha e a escolha abre na folha, em Investimentos e nas áreas pessoais.
4. Nenhuma mudança de cálculo, dados, rotas, backup ou migrações.

## Verificação

- Lint, tipos e 92 testes unitários (inclui `formatCompetenceMonth` e
  `summarizeCompetences`).
- Interface em Chrome, Android e iPhone/WebKit: Gastos familiares, Recebimentos
  e Previdência no servidor de teste (44 aprovados, 14 pulados por falta de dados
  ou de permissão do usuário de teste), com o cenário novo do seletor, que no celular
  passa pelo botão e pela folha: anos, meses únicos e múltiplos, o contador, a
  troca de ano e "Ano todo"; Investimentos no servidor normal, incluindo a folha de filtros de Posições refeita sobre o `BottomSheet` (130
  aprovados, 18 pulados), com a linha do tempo, a Visão Geral, a posição e o
  iPhone.
- Folha de competência de Investimentos (2026-10-08): suíte inteira do Playwright
  em Chrome, Pixel 7 e iPhone 16 Plus/WebKit, 272 aprovados e 191 pulados (os
  cenários da faixa pulam no celular e o `month-sheet.spec.ts` cobre a folha:
  botão no lugar da faixa, alvos de 44 px, troca de ano que só consulta, mês sem
  registro, alterações pendentes e largura em 320 e 375 px). Com três
  trabalhadores em paralelo o WebKit tem esperas que estouram; com um ou dois,
  passam. Capturas em 320 e 375 px, com a folha em 2026 e em 2023.
- Conferência no navegador em 375 e 1440 px: seletor entre o título e os cartões,
  com dois meses marcados e o contador; no celular, o botão com o resumo e a folha
  aberta, com os meses em quatro colunas.
