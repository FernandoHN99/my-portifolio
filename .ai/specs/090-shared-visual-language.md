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

## Revisão de 2026-10-08: padrão dos cards e dos componentes core

Pedido do usuário: Investimentos e Gastos familiares ficaram simples e
coerentes; Recebimentos e Previdência, detalhados, fugiram do padrão (onde ficam
os ícones dos cards, peças atômicas). Manter o núcleo e deixar só as tabelas
com estilo próprio. Registro da regra: seção "Padrão dos cards e dos
componentes core" do [guia de estilos](../../docs/style-guide.md).

Auditoria (fatos observados no código e nas telas, 1440 px):

| Peça | Investimentos / Gastos familiares | Recebimentos / Previdência antes | Depois |
| --- | --- | --- | --- |
| Ícone do card | à direita, selo `size-8` com anel | à esquerda do rótulo, sem anel | à direita, mesmo selo |
| Cor do selo | menta (ou vermelho na queda) | menta, violeta ou cinza por tom | menta; violeta só nas saídas e no excesso; sem cinza |
| Brilho no card | nenhum | mancha colorida por card, no painel do limite e uma segunda no fundo da página | nenhum; só o `ambient-glow` da página |
| Estrutura do card | `KpiCard` (valor `mt-5`) e `BalanceCard` (cópia sem ícone, valor `mt-4`, escala de fonte própria) | `SummaryCard` próprio | `KpiCard` único em `components/product`; `SummaryCard` e `BalanceCard` são o `KpiCard` (o de Gastos familiares sem ícone, valor 4 px mais baixo e escala `dense`) |
| Legenda do gráfico | itens simples, amostra quadrada | pílulas com borda e fundo | itens simples, amostra quadrada |
| Título do painel | `text-base` (gráficos) ou `text-sm` (tabelas), `tracking-[-0.025em]` | `text-sm`, `tracking-[-0.01em]`, total em selo | mesmo tamanho e espaçamento; total em texto discreto |
| Estado vazio | quadrado `size-12 rounded-2xl` | selo `size-10 rounded-xl` | o mesmo de Investimentos |
| Selo de estado | `bg-primary/10 text-primary` | `chart-saved/[0.12]` | `bg-primary/10 text-primary` (mesma cor, mesmo selo) |
| Filtros e botão do topo | uma cópia em Gastos familiares | duas cópias idênticas | uma só, em `page-controls.ts` |

Mudanças no código: `KpiCard` saiu de `modules/portfolio/ui` para
`components/product/kpi-card.tsx` (Investimentos continua com o `ChangeKpiCard`
sobre ele; ganhou `valueData`, `valueClassName`, `dense`, `emphasis`, o tom
`spent` e `icon` opcional); as classes de filtro e do botão do topo foram para
`components/product/page-controls.ts`. Sem mudança de cálculo, dados, rotas ou
backup. Os `data-testid`, `data-cents` e `data-value` continuam.

Mantido de propósito: tabelas com grupos e totais tingidos, barra de acumulado
da Previdência, lista no celular, violeta no lugar do laranja (decisão do
usuário em 2026-10-08) e o painel "Uso do limite".

Verificação: lint, tipos, 91 testes unitários, 41 cenários de interface de
Recebimentos, Previdência e Gastos familiares (3 perfis, repetidos depois de o `BalanceCard` passar ao `KpiCard`) e 74 de Investimentos
(1 falha isolada do seletor de competência passou ao repetir). Conferência no
navegador em 320, 375, 1024 e 1440 px.
