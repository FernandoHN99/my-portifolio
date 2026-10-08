# Guia de estilos da aplicação

Fonte principal das regras visuais compartilhadas por todas as áreas. A revisão
de 2026-10-07 foi pedida pelo usuário após comparar Recebimentos e Gastos
familiares com as telas existentes.

## Antes de criar ou alterar uma tela

1. Compare com os componentes equivalentes já usados em Investimentos e Gastos
   familiares, incluindo estados ativo, hover, foco, desabilitado, vazio e erro.
2. Use os tokens de `src/app/globals.css` e os componentes de `src/components/ui/`,
   `src/components/product/` e dos módulos. O mesmo significado deve receber a
   mesma aparência em cards, tabelas, listas móveis, formulários e resumos.
3. A planilha é referência de dados e regras financeiras. Não reproduza suas
   cores, fontes, bordas ou formatação como direção visual da aplicação.
4. Skills de design ajudam no acabamento, mas devem respeitar este sistema
   existente. Não introduza uma paleta ou tema próprio para cada área.

## Cores por significado

Os valores exatos e suas variantes Tailwind pertencem a `globals.css`; não
copie valores hexadecimais/OKLCH para cada componente.

| Uso | Tokens e convenção |
| --- | --- |
| Fundo da aplicação | `background`; somente tema escuro |
| Superfícies e menus | `card` / `card-foreground`, `popover` / `popover-foreground`; reaproveitar `metric-card` e `premium-panel` |
| Texto principal e valores neutros | `foreground`; zero permanece neutro |
| Rótulos, legendas, textos secundários | `muted-foreground`; `muted` para superfícies discretas |
| Marca, ação principal, seleção, destaque positivo | `primary` (verde) e `primary-foreground` no botão preenchido |
| Ação secundária e destaque discreto | `secondary` / `secondary-foreground`, `accent` / `accent-foreground`, conforme o componente existente |
| Sucesso e concluído | `success` / `success-foreground`, com texto ou ícone de confirmação |
| Pendência, atenção, pagamentos | `warning`, `warning-foreground`, `warning-border` |
| Erro de validação, ação destrutiva e queda nos indicadores de investimentos | `destructive`, acompanhado de mensagem, rótulo ou sinal |
| Bordas, campos e foco | `border`, `input`, `ring`; manter o foco visível dos controles |
| Navegação lateral | Família `sidebar-*`; item selecionado e ícone seguem os estados da navegação existente |
| Séries dos gráficos e marcas associadas | `chart-up`, `chart-down` e o mapa de categorias, conforme a seção seguinte |
| Recebimentos: o que entra e sobra / o que sai | `chart-saved` (menta, igual ao `primary`) / `chart-spent` (violeta), na seção de gráficos |

Em Gastos familiares, receber/DEVE usa `primary`, pagar/DEVO usa
`warning-foreground`. Em Recebimentos (revisão de 2026-10-08), nada usa o
amarelo/laranja: o que entra e sobra é menta (`primary`/`chart-saved`) e o que
sai é violeta (`chart-spent`), no valor das saídas, nos selos e nas barras, e
o balanço negativo também é violeta. O sinal e os rótulos continuam visíveis.
Valor zero usa `foreground`, inclusive no resumo do formulário e nos totais.
Valores informativos sem direção (bruto, patrimônio) ficam neutros.

Em Previdência (revisão de 2026-10-08), o que conta a favor do limite é menta
(`primary`/`chart-saved`): aportado, o que falta aportar, os valores dos
aportes, a renda tributável e os trechos da barra de uso do limite. O que passa
do limite é violeta (`chart-spent`), no cartão, no percentual e no trecho
excedente da barra; nunca amarelo ou laranja. Os cartões de renda tributável
e limite são neutros. As linhas do holerite são selos `primary/10` quando entram
no cálculo e neutros quando ficam fora (13º, PLR); "proporcional" e "saldo
inicial" usam `accent`. O usuário achou a tela "toda branca": o ícone menta dos
cartões, tabelas com colunas de valor tingidas e barras de acumulado devolvem a
cor sem inventar paleta.

Tooltips de gráfico mostram a cor da série numa marca ao lado do nome e o
valor em texto neutro.

Nos indicadores de variação de Investimentos, conservar `primary` para alta
e `destructive` para queda, com sinal/seta. Uma saída de caixa não é, por si
só, erro nem perda de rentabilidade.

## Padrão dos cards e dos componentes core

Pedido do usuário em 2026-10-08, depois de comparar as áreas: Investimentos e
Gastos familiares, mais simples, são a referência de identidade; Recebimentos e
Previdência, detalhados demais, fugiram dela (ícone do lado errado, brilhos,
legendas em pílulas). O que é do núcleo do app se repete igual em toda área;
só o miolo das tabelas pode ter estilo próprio.

**Átomos com `tailwind-variants`** (spec 096): todo componente atômico, novo ou
alterado, declara suas variantes com `tv` (`tailwind-variants`, que usa o
`tailwind-merge` para resolver conflitos de classe). As classes ficam completas
nas variantes, para o Tailwind encontrá-las, e o chamador só escolhe a variante
(`tone`, `active`, `dense`…); `className` serve para ajuste de encaixe, não para
refazer o visual. Exemplos: `KpiCard`, `Badge`, `filterBadge`, `headerButton`,
`MonthStrip`, `YearMonthPicker`, `BottomSheet` e o `Button` de `components/ui`. O `cva` saiu do projeto.

**Regra:** antes de desenhar um card, painel, selo, legenda, botão ou filtro,
use o componente core. Se faltar uma opção, estenda o componente (tom, `dense`,
`footer`) em vez de copiá-lo para a área. Cada área reaproveita; ninguém
redefine as mesmas classes (o filtro de pessoa, de ano e o botão do topo tinham
três cópias e hoje vivem em `page-controls.ts`).

| Peça | Padrão do app | Onde fica |
| --- | --- | --- |
| Card de indicador | `metric-card rounded-2xl p-4 sm:p-5`: rótulo à esquerda (10 px, caixa alta, `tracking-[0.14em]`), **ícone à direita** num selo `size-8 rounded-lg ring-1` com o desenho duotone de 18 px, valor mono (`mt-5`, `text-2xl`), detalhe `text-xs` e, se preciso, um `footer` discreto. O ícone só ganha cor pelo tom: menta, violeta (saída, excesso) ou vermelho (queda). Gastos familiares usa o mesmo componente sem ícone (`BalanceCard` é o `KpiCard` sem `icon`); se um card tiver ícone, ele fica à direita, nunca ao lado do rótulo. | `components/product/kpi-card.tsx` (`KpiCard`); `SummaryCard` (`finance-parts.tsx`) e `BalanceCard` (`family-ledger.tsx`) são o `KpiCard` com valor em centavos |
| Valor do card | Neutro em `foreground`; cor só quando o número diz algo (alta em `primary`, queda em `destructive`, saída em `chart-spent`). `dense` reduz a fonte nas grades de duas colunas do celular. | `KpiCard` |
| Painel | `premium-panel rounded-[24px]`. Painel de gráfico ou resumo: `p-5 sm:p-7` e título `text-base font-semibold tracking-[-0.025em]`. Painel de tabela: título `text-sm`, com o total ao lado em texto discreto (`text-[11px] text-muted-foreground`, como "12 de 40"), nunca num selo. | `globals.css` |
| Brilho | Só o `ambient-glow` no canto superior direito da página. Sem manchas coloridas dentro de cards, painéis ou atrás deles. | `globals.css` |
| Legenda de gráfico | `ul` simples: amostra quadrada `size-2.5 rounded-[3px]` (série) ou redonda `size-2` (marca), texto `text-[11px] text-muted-foreground`, valores em mono. Sem pílulas, bordas ou fundos. | `balance-change-chart.tsx` |
| Selo de estado | `Badge`: pílula de 10 px em caixa alta, com o tom no significado: `primary` (a favor), `spent` (saída, excesso), `accent` (saldo inicial, proporcional), `warning` (pendência), `neutral` (fora do cálculo). | `components/product/badge.tsx` |
| Competência | Investimentos: a faixa da Visão Geral, com cápsulas de ano e, no ano aberto, os meses (`MonthStrip`; alvos de 44 px no toque); no celular a faixa dá lugar a um botão com o mês ("Set/26") que abre os anos e os doze meses numa folha, um mês por vez (`MonthSheet`). Áreas pessoais (Gastos familiares): um cartão embaixo do título, com os anos num controle de marcador deslizante e a régua dos doze meses do ano aberto (os anos do mais recente ao mais antigo, os meses de Jan a Dez); um mês por vez ou vários (meses seguidos viram uma faixa) e "Ano todo" (`YearMonthPicker`). No celular, o seletor vira um botão de uma linha com o resumo da seleção, que abre a escolha na folha de baixo, como os filtros. Nenhuma tela desenha o seu próprio seletor de meses. | `components/product/month-strip.tsx`, `month-sheet.tsx`, `year-month-picker.tsx` |
| Folha de baixo (celular) | Uma peça só para filtros e competência: alça, título, conteúdo rolável e rodapé com o botão principal ("Ver N lançamentos") e, se preciso, "Limpar"; sem rodapé quando a escolha se resolve com um toque (a competência de Investimentos). | `components/product/bottom-sheet.tsx` |
| Filtros e botões do topo | Selos de filtro (ano, pessoa), botão secundário do topo e botão principal. | `components/product/page-controls.ts` (`filterBadge`, `headerButton`), `edit-dialogs.tsx` |
| Cabeçalho da página | Faixa "Finanças", título `text-[2.65rem]`, linha de contagem, ações à direita, `ambient-glow`. | `family-ledger.tsx` |
| Estado vazio | Ícone num quadrado `size-12 rounded-2xl border border-border bg-card text-primary` e uma frase. | `empty-portfolio.tsx` |

**Tabelas podem ser diferentes.** Cabeçalhos agrupados, coluna de total
tingida, barra de acumulado, lista no celular e selos por linha são decisões
de cada tabela e ficam descritas na spec da área (Recebimentos e Previdência
usam todas elas). Mesmo assim, a moldura é a do núcleo (painel `premium-panel`),
o cabeçalho segue o das Posições (9 px, caixa alta), os valores são mono e as
cores saem do mapa de tons (`TONES`) em vez de valores soltos.

## Gráficos e acessibilidade

O usuário é daltônico. A [spec 038](../.ai/specs/038-colorblind-charts.md)
estabeleceu a paleta Okabe-Ito: azul `chart-up` e laranja `chart-down` para
alta/queda, com roxo nas marcas de aportes/resgates. As categorias e moedas
usam o mapa em `src/modules/portfolio/presentation/category-colors.ts`.

Essa escolha pertence ao app e deve ser preservada nos gráficos, legendas,
tooltips e marcas de movimentos associadas, **exceto em Recebimentos**, onde o
usuário pediu, em 2026-10-08, outra cor no lugar do amarelo/laranja. O par
`chart-saved` (menta, `oklch(0.79 0.15 158)`) e `chart-spent` (violeta,
`oklch(0.70 0.17 305)`) foi escolhido com a simulação de daltonismo (matrizes
de Machado, severidade 1, distância ΔE2000 entre as duas cores):

| Par | Normal | Protanopia | Deuteranopia | Tritanopia |
| --- | --- | --- | --- | --- |
| azul `chart-up` × laranja `chart-down` (Investimentos) | 54 | 51 | 54 | 54 |
| menta × laranja (o que não serve) | 42 | 16 | 18 | 59 |
| menta × azul `chart-up` | 39 | 40 | 37 | 8 |
| **menta × violeta (Recebimentos)** | **50** | **49** | **41** | **44** |

Os dois tokens valem só em Recebimentos; os gráficos de Investimentos seguem o
azul e o laranja. Contraste do violeta com o fundo dos cards: 6,8:1. Quem
quiser outra cor para esse par deve repetir a simulação antes de trocar. Em Gastos × Poupado, cada série
mantém a cor da legenda mesmo quando o saldo fica abaixo de zero; a posição
em relação ao eixo e o valor assinado indicam o resultado.

Não transportar automaticamente a cor de uma série para cards financeiros,
totais, seleções ou formulários (em Recebimentos, menta e violeta são a
linguagem da área inteira por decisão do usuário, e não só do gráfico). A spec 038 já distingue gráficos de
indicadores textuais. Os badges de movimentos e as marcas da linha do tempo
de Investimentos têm convenção própria ligada aos gráficos; não trocar todas
as ocorrências de `chart-*` indiscriminadamente.

Cor nunca deve ser o único indicador: manter nomes das séries, sinais,
legendas, rótulos e ícones. Preserve as tabelas acessíveis dos gráficos e o
comportamento de toque existente.

## Componentes, densidade e responsividade

- Reutilizar os botões, diálogos, `DatePicker`/`MonthPicker`, seletores,
  filtros e notificações existentes, inclusive suas cores de interação.
- Filtros ativos usam contorno `primary/30`, fundo `primary/[0.08]` e texto
  `primary`; inativos usam borda padrão, fundo discreto e texto secundário.
- Tipografia sans para texto e mono/tabular para dinheiro; manter a escala
  compacta e os raios dos componentes equivalentes.
- Cabeçalhos de listas e ícones auxiliares devem ser discretos. Reduzir o
  desenho do ícone não deve eliminar seu nome acessível, foco ou área de toque.
- Em telas pequenas, conter a rolagem horizontal nas faixas que precisam
  dela (como meses); a página inteira não deve transbordar. Manter o mês
  selecionado visível e a navegação por teclado.
- Conferir tela principal, tabela, lista móvel, formulário e estados vazios
  no navegador. Animação, hover e toque seguem `globals.css` e os componentes
  existentes, incluindo movimento reduzido.

## Referências de implementação

- Tokens e superfícies: `src/app/globals.css`.
- Card de indicador, selo, faixa de competência, controles do topo e peças de
  Recebimentos/Previdência: `src/components/product/kpi-card.tsx`, `badge.tsx`,
  `month-strip.tsx`, `year-month-picker.tsx`, `bottom-sheet.tsx`, `page-controls.ts` e `finance-parts.tsx`.
- Marca e navegação: `src/components/product/area-nav.tsx` e `app-shell.tsx`.
- Formulários e controles: `src/components/ui/` e
  `src/modules/portfolio/ui/edit-dialogs.tsx`.
- Receber/pagar, badges e totais: `src/modules/family-expenses/ui/ledger-parts.tsx`
  e [spec 085](../.ai/specs/085-family-ledger-and-navigation-polish.md).
- Gráficos: `src/modules/portfolio/presentation/category-colors.ts` e
  [spec 038](../.ai/specs/038-colorblind-charts.md).

Ao mudar uma convenção, atualize esta fonte e os componentes afetados;
outros documentos devem apenas referenciá-la.
