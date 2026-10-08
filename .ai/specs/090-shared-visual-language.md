# 090 — Cores e linguagem visual compartilhadas

Estado: implementada e conferida localmente em 2026-10-07; publicação junto com
as specs 088 a 092.
Origem: comentários no navegador sobre azul/laranja em Recebimentos e pedido
explícito de registrar nas instruções o uso do estilo existente do app.

## Evidências e decisão

- Os commits existentes já definem azul/laranja para gráficos por
  acessibilidade na [spec 038](038-colorblind-charts.md). Não há evidência
  de que essa escolha do app tenha vindo do Excel.
- Recebimentos e Previdência estavam em implementação local, sem commit,
  ao iniciar esta revisão (referências 088/089 no código). Preservar esse
  trabalho e não declarar sua publicação/conclusão nesta spec.
- A nova regra compartilhada fica em [docs/style-guide.md](../../docs/style-guide.md),
  referenciada pelo AGENTS.md raiz e, por importação, pelo CLAUDE.md.

## Critérios de aceite

1. Guia cobre cores de superfícies, textos, botões, seleção, sucesso,
   atenção, erro, borda/foco, navegação e gráficos, com referências ao código.
2. Dados e regras podem vir da planilha; a aparência segue o app existente.
3. Valores de Recebimentos usam primary/atenção e zero neutro no resumo,
   meses, totais desktop/móvel e formulário. Gráficos preservam a spec 038.
4. DEVE/DEVO no formulário de Gastos familiares seguem as cores já usadas
   na lista e no resumo da área.
5. Sem mudança de cálculo, modelo, backup ou dados reais.

## Revisão

| Before | After | Why |
| --- | --- | --- |
| Cores das séries copiadas para valores de Recebimentos | Verde/atenção e zero neutro nos valores; gráfico mantém azul/laranja | Consistência com as tarefas financeiras e preservação da acessibilidade |
| DEVE/DEVO com cores diferentes entre formulário e lista | Mesmos tokens nos dois contextos | O mesmo significado mantém a mesma aparência |
| Regras visuais espalhadas | Guia referenciado nas instruções compartilhadas | Próximas áreas partem dos componentes existentes |

## Verificação

Lint e tipos passaram com as specs 088 a 092. Conferência no navegador
(servidor de teste): Recebimentos com valores em `primary`/atenção e zero
neutro, gráfico em azul/laranja (spec 038), Previdência com "falta aportar" em
`primary` e "acima do limite" em atenção, e DEVE/DEVO do formulário com as
cores da lista.
