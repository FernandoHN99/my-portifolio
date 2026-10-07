# 087 — Organização dos gastos e reversão de acertos

Estado: implementação e verificações locais concluídas em 2026-10-07;
publicação autorizada pelo usuário, em andamento.
Origem: nove comentários no navegador sobre Gastos familiares.

## Critérios de aceite

1. Sem faixa fixa “Finanças”: o hambúrguer fica junto ao título da página,
   sem ocupar uma linha inteira. A barra lateral no computador permanece.
2. Cards de resumo acima dos filtros; filtros imediatamente antes da lista.
   Todos continuam representando a pessoa e os lançamentos filtrados.
3. Multisseleção de competências ao lado do rótulo, próxima aos meses.
4. Mais de um grupo mensal recebe contorno e espaçamento próprios, cabeçalho
   verde discreto e subtotal. O valor de cada linha ocupa uma coluna central
   no computador; descrição, status e ação continuam separados.
5. Meses e pessoas sem pendências recebem o mesmo pequeno ✓ e título acessível.
   Meses consideram a pessoa atual; pessoas consideram as competências escolhidas.
   Busca, status e tipo não escondem pendências nesses indicadores. Saldo zero
   com lançamentos pendentes não equivale a “sem pendências”.
6. O botão Pessoas sai do cabeçalho. O formulário mantém inclusão de pessoa.
7. Acertados recebem a ação “Reverter acerto”, com seta de retorno e Desfazer.
   A operação altera somente status, confere a concessão e o dono no servidor,
   recusa ids alheios e lançamentos já pendentes e revalida a página.
8. Sem mudança de modelo ou formato dos backups.

## Verificação

- ESLint, TypeScript e build de produção aprovados.
- 66 testes unitários e 10 de integração aprovados. O novo cenário de banco
  confere reversão, preservação dos demais campos, recusa a outro usuário e
  Desfazer. Todas as gravações de teste usam `gastos_familiares_teste`.
- E2E: 17 aprovados e 5 pulados em Chrome, Android/Chrome e iPhone/WebKit,
  incluindo reversão/Desfazer, séries, filtros, menu e larguras de 320–430 px.
  Uma primeira execução concorrente misturou a leitura com o teste de escrita;
  a execução serial passou. O teste de Desfazer identifica a notificação atual,
  pois a anterior pode estar terminando a animação de saída.
- Conferência no navegador em 799 px: cards acima dos filtros, valores próximos
  à descrição e blocos de mês separados. Captura em
  `artifacts/spec-087/gastos-tablet.png` (fora do Git).
- A publicação e a conferência de dados e acessos estão em
  [Produção](../context/production.md).
