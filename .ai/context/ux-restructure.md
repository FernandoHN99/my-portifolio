# Reestruturação da UX

Registrado em: 2026-10-01
Origem: briefing do usuário, com capturas da planilha anexadas na conversa.
Estágio: em execução, dividida nas specs 010 a 014.

Este documento é a fonte principal do propósito, das restrições e das regras
de cálculo desta iniciativa. As specs descrevem cada fatia e apontam para
aqui em vez de repetir estas definições.

## Propósito do produto

O app serve para o usuário percorrer o histórico dos investimentos e entender
o que fazer na prática:

- selecionar um mês e ver toda a carteira daquele mês responder na hora;
- comparar alocação atual com a ideal e receber a ação correspondente,
  comprar ou vender, com o valor em reais;
- consultar e editar os dados de qualquer mês com a facilidade da planilha.

## Restrições declaradas pelo usuário

- Previdência não entra em nenhuma fatia desta reestruturação;
- não haverá serviço de sincronização com o Excel; a importação já ocorreu
  uma vez e o aplicativo passou a ser a fonte da verdade;
- a barra lateral é removida e a navegação fica no topo;
- as bibliotecas atuais são mantidas: Next 16, React 19, Prisma, shadcn com
  Base UI, Tailwind 4, Phosphor e Zod.

## Regras de cálculo

- `Total(R$)` de uma posição com ticker é quantidade vezes a cotação do mês;
  sem ticker, a quantidade já é o próprio valor em reais;
- as cotações ficam em reais; `USD` representa o câmbio do mês e as posições
  em dólar, como USDC e Time Deposit, usam esse ticker;
- a moeda base da posição é a moeda de exposição do ticker; sem ticker, BRL;
- o total rateado de uma classificação é o peso do rateio aplicado ao total
  da posição;
- `Total(US$)` é o total em reais dividido pelo câmbio do mês;
- todas as análises partem das classificações ponderadas, não do nome do
  ativo;
- a identidade de uma posição é o seu identificador; data e nome nunca devem
  ser usados como chave, porque a planilha tinha nomes repetidos no mesmo mês
  e isso gerava erro.

## Denominadores dos percentuais

A planilha era inconsistente neste ponto. A definição adotada é:

- geral: percentual sobre o patrimônio total;
- caixa, renda fixa e renda variável: percentual sobre o total atual da
  respectiva classe;
- o valor ideal de uma subcategoria é o percentual ideal aplicado ao valor
  ideal da classe-mãe.

## Bibliotecas escolhidas para a iniciativa

Gráficos com Recharts pelo wrapper de gráfico do shadcn; tabela com
`@tanstack/react-table` e `@tanstack/react-virtual`; estado de mês e filtros
na URL com `nuqs`; transições com `motion`; formulários com
`react-hook-form` e o resolver de Zod; avisos com `sonner`; datas com
`date-fns`; números animados com `@number-flow/react`; atalhos com
`react-hotkeys-hook`; mutações por Server Actions.

Formatação com `Intl.NumberFormat` em pt-BR e cores fixas por categoria, de
modo que uma mesma classe tenha sempre a mesma cor em todos os gráficos.

## Fatias

1. [010 — Navegação no topo e seletor global de mês](../specs/010-global-shell-month-selector.md): concluída.
2. [011 — Visão Geral](../specs/011-overview-tab.md): concluída.
3. [012 — Aba de alocação com sub-abas](../specs/012-allocation-tabs.md): planejada.
4. [013 — Posições editáveis](../specs/013-positions-editing.md): planejada.
5. [014 — Configuração da carteira](../specs/014-target-settings.md): planejada.

Cada fatia termina com `pnpm check`, `pnpm build` e os testes do Playwright.

## Critérios de aceite da iniciativa

- não existe barra lateral; as abas ficam no topo, com transição, e há gesto
  lateral no mobile;
- trocar o mês no seletor global atualiza indicadores, gráficos, alocação e
  posições, e o mês permanece na URL;
- o gráfico de evolução tem seleção de intervalo e atalhos de período, e
  clicar em uma coluna seleciona o mês;
- a aba de alocação tem as quatro sub-abas, cada uma com gráficos de atual
  contra ideal e tabela de comprar ou vender;
- a aba de posições tem filtros por coluna, atalhos por classe, totais
  filtrados e edição direta; meses passados exigem confirmação;
- o rateio de uma posição valida soma igual a 100% e existe a função de
  clonar o mês anterior;
- a configuração valida 100% por grupo e mostra prévia das ações antes de
  salvar;
- nada de Previdência.
