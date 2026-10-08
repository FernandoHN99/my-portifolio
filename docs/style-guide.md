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

Em Gastos familiares, receber/DEVE usa `primary`, pagar/DEVO usa
`warning-foreground`. Em Recebimentos, poupado positivo usa `primary`, saídas
e balanço negativo usam `warning-foreground`. O sinal e os rótulos continuam
visíveis. Valor zero usa `foreground`, inclusive no resumo do formulário e
nos totais. Valores informativos sem direção (bruto, patrimônio, total de
entradas) podem permanecer neutros.

Em Previdência, o valor que falta aportar usa `primary`; acima do limite usa
`warning-foreground`. Isso indica a situação em relação ao limite, não alta
ou queda de um investimento.

Nos indicadores de variação de Investimentos, conservar `primary` para alta
e `destructive` para queda, com sinal/seta. Uma saída de caixa não é, por si
só, erro nem perda de rentabilidade.

## Gráficos e acessibilidade

O usuário é daltônico. A [spec 038](../.ai/specs/038-colorblind-charts.md)
estabeleceu a paleta Okabe-Ito: azul `chart-up` e laranja `chart-down` para
alta/queda, com roxo nas marcas de aportes/resgates. As categorias e moedas
usam o mapa em `src/modules/portfolio/presentation/category-colors.ts`.

Essa escolha pertence ao app e deve ser preservada nos gráficos, legendas,
tooltips e marcas de movimentos associadas. Em Gastos × Poupado, cada série
mantém a cor da legenda mesmo quando o saldo fica abaixo de zero; a posição
em relação ao eixo e o valor assinado indicam o resultado.

Não transportar automaticamente a cor de uma série para cards financeiros,
totais, seleções ou formulários. A spec 038 já distingue gráficos de
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
- Marca e navegação: `src/components/product/area-nav.tsx` e `app-shell.tsx`.
- Formulários e controles: `src/components/ui/` e
  `src/modules/portfolio/ui/edit-dialogs.tsx`.
- Receber/pagar, badges e totais: `src/modules/family-expenses/ui/ledger-parts.tsx`
  e [spec 085](../.ai/specs/085-family-ledger-and-navigation-polish.md).
- Gráficos: `src/modules/portfolio/presentation/category-colors.ts` e
  [spec 038](../.ai/specs/038-colorblind-charts.md).

Ao mudar uma convenção, atualize esta fonte e os componentes afetados;
outros documentos devem apenas referenciá-la.
