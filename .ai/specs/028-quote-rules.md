# 028 — Regras de cotação: fechamento, edição restrita e histórico global

Estado: concluída em 2026-10-02.
Definida em: 2026-10-02

## Problema

Respostas do usuário em 2026-10-02 às questões em aberto das specs 020 e 022,
registradas em [Reestruturação da UX](../context/ux-restructure.md), em
"Respostas do usuário às questões em aberto, 2026-10-02 (segunda rodada)":

- "A ideia eu nem planejava editar na mão mesmo, só deixe editar na mão se não
  for encontrada ou der erro na solicitação";
- o botão de atualizar cotações deve aparecer só quando o mês selecionado for
  o mês corrente;
- o histórico de execuções deve mostrar todas as execuções, de qualquer mês,
  cobrindo 36 meses;
- uma posição recém-incluída mostrava "–" em "Última atualização"; deve
  mostrar a data, indicando que veio da inclusão;
- os endereços antigos devem ser removidos;
- todos os meses guardam, para cada ativo, a cotação do último dia disponível
  daquele mês; gráficos e valorização usam essa cotação de fechamento. As
  cotações antigas não são apagadas: vale sempre a mais recente do mês.

## Comportamento

### Edição à mão restrita

Uma cotação da competência é editável quando:

- não tem valor no mês;
- foi repetida de outra competência (`carried_from`), ou seja, não foi
  encontrada no mês; ou
- a última busca dela no mês falhou.

As demais vêm dos provedores ou da planilha. A regra fica em
`isQuoteEditable` (`src/modules/quotes/domain/quote-refresh.ts`) e vale na
tela e no servidor: `updateMonthQuotes` recusa com "BTC vem da atualização
automática e não pode ser editada." O botão "Editar cotações" só aparece com
pelo menos uma cotação editável; sem nenhuma, a página explica a regra. No
modo de edição, só as editáveis têm campo; as outras mostram "Automática".

### Atualização só no mês corrente

A seta do topo e o botão do card "Última atualização" só aparecem quando a
competência selecionada é a do mês corrente, ou em telas sem mês, como a
configuração. Nos outros meses o topo mostra só o horário da última
atualização, e a checagem ao abrir continua rodando normalmente.

### Histórico de execuções global

O histórico da página de cotações mostra todas as execuções dos últimos 36
meses, de qualquer competência, com o total, em páginas de 30 com "Mostrar
mais" (`getRunHistory` e `loadRunHistoryAction`). A execução antiga de
"Atualizar carteira" continua visível; o usuário pediu uma explicação sobre
ela, e o comportamento fica como está até a resposta.

O último resultado por cotação continua sendo o da competência selecionada:
num mês passado, é a última busca daquele mês, que formou o fechamento.

### Data da inclusão

Uma cotação buscada ao incluir uma posição nova
([spec 026](026-new-position-entities.md)) fica no histórico diário sem
execução. Até a próxima atualização, "Última atualização" mostra "Incluída em
<data e hora>", o provedor e "ao incluir a posição".

### Endereços antigos removidos

Os desvios de `/atualizacao` e `/importacao` saíram de `next.config.ts`; os
endereços respondem 404.

### Cotação de fechamento do mês

O modelo da [spec 020](020-daily-quotes.md) já atende à decisão:

- cada execução guarda o valor de cada símbolo em `quote_refresh_results`, sem
  apagar os anteriores; `daily_quotes` guarda o valor mais recente de cada
  dia, e `market_quotes`, o mais recente do mês;
- a competência do mês corrente é reprecificada a cada atualização; quando o
  mês vira, a última atualização feita dentro dele fica como fechamento;
- a virada de mês ([spec 021](021-automatic-month-rollover.md)) usa a
  cotação do último dia disponível de cada mês gerado;
- o gráfico de cotação da página da posição
  ([spec 016](016-position-history.md)) passou a mostrar um ponto por mês: a
  cotação da competência e, nos meses sem ela, a diária mais recente do mês.

Os meses passados importados da planilha não são alterados; o acerto deles
fica para o [passo pré-produção](../context/pre-deploy.md).

## Decisões tomadas

- a edição restrita vale também para competências passadas: as cotações
  importadas não são editáveis, porque o histórico será refeito no passo
  pré-produção;
- uma cotação editada à mão depois de uma falha continua editável até a
  próxima busca bem-sucedida, que a substitui;
- o histórico de execuções usa paginação por cursor (o instante da última
  execução da página) em vez de um limite fixo, porque a atualização ao abrir
  pode gerar centenas de execuções num mês.

## Critérios de aceite

- cotações vindas dos provedores ou da planilha não têm campo de edição, e o
  servidor recusa editá-las;
- a seta de atualizar não aparece em meses passados, e o topo não corta as
  abas em 320 e 360 px, com ou sem a seta;
- o histórico mostra execuções de qualquer mês, com o total dos últimos 36
  meses e "Mostrar mais";
- uma posição incluída mostra "Incluída em" até a próxima atualização;
- `/atualizacao` e `/importacao` respondem 404.

## Verificação

- `pnpm check`, `pnpm build` e a suíte do Playwright;
- `tests/e2e/quotes-page.spec.ts` e `tests/e2e/quote-refresh.spec.ts` cobrem
  o botão oculto em Set/26, a explicação sem cotação editável, o histórico de
  36 meses, as páginas removidas e o topo sem seta em 320 e 360 px;
- os cenários de edição de cotação só rodam quando a competência aberta tem
  uma cotação editável. Nos dados reais de 2026-10-02 não havia nenhuma, e eles
  ficaram pulados;
- a recusa do servidor foi conferida com um roteiro descartável: editar o BTC
  de Set/26 foi recusado e o valor continuou R$ 395.046,00.

## Referências

- [Cotações diárias e atualização ao abrir](020-daily-quotes.md)
- [Página de cotações em Posições](022-quotes-page.md)
- [Passo pré-produção](../context/pre-deploy.md)
