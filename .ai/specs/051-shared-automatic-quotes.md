# 051 — Cotações automáticas compartilhadas, à mão por usuário e só atualização automática

Estado: concluída em 2026-10-03.
Definida em: 2026-10-03

## Problema

Pedido do usuário em 2026-10-03, junto do login ([spec 050](050-login-and-user-data.md)):

- "precisamos provavelmente mudar a forma como as cotações são armazenadas: a
  ideia é que elas sejam compartilhadas entre os usuários, pelo menos as
  cotações automáticas; as manuais, em caso de erro, podem permanecer ao
  usuário";
- "Atualizações manuais não serão mais aceitas! Somente automáticas!"

## Interpretação adotada (a confirmar com o usuário)

Havia duas coisas "manuais" no app, e o pedido trata cada uma:

1. **A atualização manual**: a seta do topo e o botão "Atualizar cotações" do
   card "Última atualização" disparavam a busca nos provedores na hora
   (`/api/quotes/refresh`, gatilho `MANUAL`). Saem. As cotações passam a ser
   buscadas só pela checagem automática, ao abrir o app, quando a última
   tentativa tem mais de uma hora ([spec 020](020-daily-quotes.md));
2. **A cotação editada à mão**: a edição na página de cotações, permitida só
   para cotação não encontrada ou com falha na última busca
   ([spec 028](028-quote-rules.md)). Continua, como "em caso de erro", e fica
   com o usuário que a digitou.

## Comportamento

- **Compartilhadas**: o histórico diário (`daily_quotes`), a cotação de cada
  mês vinda dos provedores ou da virada de mês (`market_quotes`) e as
  execuções da atualização (`quote_refresh_runs` e `quote_refresh_results`)
  não têm usuário. Uma atualização busca os símbolos da competência mais
  recente de todos os usuários e reprecifica a competência do mês corrente de
  cada um;
- **À mão, por usuário**: a cotação digitada vai para `manual_quotes`, com o
  usuário, o mês e o símbolo, e vale só para ele, por cima da compartilhada,
  nas posições, nos gráficos e na página de cotações. A primeira atualização
  bem-sucedida do símbolo no mês corrente apaga as cotações à mão daquele mês e
  reprecifica as posições, como antes;
- a inclusão de um ativo novo grava a cotação buscada na conferência do ticker
  como compartilhada e a digitada, quando o provedor falha ou a competência é
  passada, como à mão do usuário;
- a virada de mês e o clone criam as cotações compartilhadas do mês novo só se
  ainda não existirem; uma cotação à mão sem compartilhada correspondente é
  repetida como à mão do usuário;
- desfazer uma alteração ou a criação de uma competência nunca apaga cotação
  compartilhada;
- **Execuções vistas por usuário**: o topo, o card e o histórico mostram, de
  cada execução, só os símbolos do usuário: quantas deram certo, as falhas e
  os ativos dele. A execução guarda o mês reprecificado (`repriced_month`) em
  vez de apontar para a competência de um usuário, e perde o gatilho, que era
  sempre automático;
- **Sem atualização manual**: saem a seta e o botão, a rota
  `/api/quotes/refresh` e o gatilho `MANUAL`. O topo continua mostrando há
  quanto tempo foi a última atualização;
- **Backup**: versão 4. Entram as cotações à mão (`manualQuotes`); saem as
  execuções, que são de todos, e o `runId` das cotações diárias
  ([Formato do backup](../../docs/backup-format.md)).

## Critérios de aceite

- dois usuários com o mesmo símbolo veem a mesma cotação automática; a cotação
  à mão de um não aparece para o outro;
- não há botão nem rota de atualização manual;
- a falha de um símbolo que só outro usuário tem não aparece para quem não o
  tem;
- `pnpm check`, `pnpm build` e a suíte do Playwright passam.

## Verificação

Em 2026-10-03:

- a migração `20261003230000_shared_quotes` rodou no banco local: 14 das 15
  execuções ganharam o mês reprecificado a partir da competência ligada; a
  outra já não tinha competência;
- num schema de teste com os usuários A e B, cada um com o backup de
  2026-10-03 restaurado ([spec 052](052-per-user-backup.md)), chamando as
  funções do app como cada usuário:
  - sem a cotação compartilhada de VOO no mês corrente, A digitou R$ 3.000: A
    vê "à mão" e as posições dele foram reprecificadas; B vê VOO sem valor e
    editável, e as posições dele não mudaram;
  - o backup de A trouxe a cotação digitada; o de B, não;
  - B ganhou um ativo ZZZ que só ele tem. Numa atualização simulada, com
    sucesso em todos os símbolos e falha em ZZZ, a execução de todos terminou
    com falhas; A a viu concluída, com 10 cotações certas e nenhuma falha, e B
    a viu com a falha de ZZZ, nomeando "Ativo Z de B";
  - a busca bem-sucedida de VOO apagou a cotação digitada por A e reprecificou
    as posições dos dois a R$ 3.100;
- `pnpm typecheck`, `pnpm lint`, `pnpm build` e a suíte do Playwright, com os
  cenários de cotação reescritos para a atualização só automática: não há
  botão em nenhum mês, `/api/quotes/refresh` responde 404 e a checagem
  demorada mostra "Atualizando cotações…" no topo e no card.

## Referências

- [Login e dados por usuário](050-login-and-user-data.md)
- [Cotações diárias e atualização ao abrir](020-daily-quotes.md)
- [Regras de cotação](028-quote-rules.md)
