# 053 — Cotações atualizadas por um job agendado, fora da navegação

Estado: implementada localmente, em commit na branch `feat/specs-053-062`, sem
push nem deploy. O projeto de jobs do Neon existe, ainda sem função nem
gatilho (2026-10-04).
Definida em: 2026-10-04

## Problema

Pedido do usuário em 2026-10-04: a atualização das cotações não pode depender
das visitas. Hoje, ao abrir o app, o navegador chama a checagem de abertura
(`/api/quotes/open-check`), e o servidor busca as cotações se a última
tentativa tem mais de uma hora ([spec 020](020-daily-quotes.md),
[spec 051](051-shared-automatic-quotes.md)). Ele quer:

- escrita das cotações só por um job agendado, de hora em hora, e leitura pelo
  Next.js, sem que o acesso dispare atualização;
- cotação compartilhada, uma série por ticker, nunca por usuário;
- ticker novo sincronizado de forma assíncrona: a inclusão registra o ticker
  como pendente e o job carrega o histórico, com a interface avisando que ele
  está sendo preparado;
- registro de última tentativa, último sucesso, erro e tentativas;
- idempotência, proteção contra execuções simultâneas, falha de um ticker sem
  derrubar os outros, timeout, limite de consultas e de tickers por execução;
- análise de retenção e compactação antes de qualquer limpeza, com estimativa
  de crescimento;
- preferência de agendamento: Neon Functions com o cron do Neon; GitHub
  Actions como reserva; Vercel Cron só num plano que permita a frequência;
- as configurações do agendamento versionadas no repositório (mensagem de
  2026-10-04);
- nada publicado na Vercel: tudo validado só localmente.

## O que existe hoje (levantamento)

### Modelo

- `daily_quotes`: a série compartilhada de cada símbolo, **uma linha por
  símbolo e dia** (`@@unique([symbol, quoteDate])`). A atualização de cada hora
  sobrescreve a linha do dia (upsert), então já guarda só a última cotação
  válida do dia. Não existe cotação horária guardada;
- `market_quotes`: a cotação de cada mês por símbolo, a usada pela carteira
  (preço das posições da competência), atualizada pela busca do mês corrente e
  repetida pela virada de mês;
- `manual_quotes`: a digitada à mão, por usuário ([spec 051](051-shared-automatic-quotes.md));
- `quote_refresh_runs` e `quote_refresh_results`: o registro de cada execução
  e o resultado de cada símbolo, a única parte que cresce por hora;
- não há tabela de tickers. O símbolo (`symbol`) já é a chave compartilhada
  das três tabelas de cotação. A relação usuário × ticker é o ativo do usuário
  (`assets.quote_symbol`); o tipo e a moeda do símbolo vêm da cotação mais
  recente, e a moeda da CoinGecko fica em `assets.quote_provider_id`.

### Histórico inicial

- **Quanto**: os últimos 36 meses (`HISTORY_BACKFILL_MONTHS`), um ponto por
  mês, o fechamento (último pregão do mês), guardado em `daily_quotes`
  ([spec 029](029-asset-price-history.md));
- **Onde**: `backfillNewAssetHistories`, chamado com `after()` depois de
  `addPositionAction`, durante a requisição do usuário (depois da resposta);
- **De quem**: Yahoo Finance (`/v8/finance/chart`, range de 3 anos, intervalo
  diário) para ações e ETFs, com o `TIME_SERIES_MONTHLY` do Alpha Vantage de
  reserva; velas mensais da Binance para cripto, com a CoinGecko (365 dias)
  de reserva; o dólar do mês pela PTAX do Banco Central, com a AwesomeAPI de
  reserva;
- **Granularidade recebida**: fechamento diário (Yahoo, CoinGecko, PTAX) ou
  mensal (Binance, Alpha Vantage); guardamos só o fechamento de cada mês;
- **Quem usa**: o gráfico e a valorização da página da posição
  ([spec 016](016-position-history.md)), que usam um ponto por mês
  (`monthlyClosings`), e a virada de mês, que pega a cotação diária mais
  recente do mês para precificar a competência nova
  ([spec 021](021-automatic-month-rollover.md));
- **Intraday**: nada usa. Não há gráfico intraday, variação do dia, máxima ou
  mínima, nem cálculo por horário. A auditoria das execuções fica nas
  execuções, não nas cotações.

### Cotação atual

`fetchCurrentQuotes` busca o preço de agora em cadeias de provedores
([spec 037](037-quote-provider-chains.md)):

| Grupo | Cadeia | Limite gratuito conhecido |
|---|---|---|
| Câmbio (USD) | AwesomeAPI → PTAX do BCB → Yahoo | sem limite publicado; PTAX sem chave |
| Cripto | CoinGecko (uma consulta para todos) → Binance | CoinGecko demo: 30 por minuto e 10 mil por mês |
| Ativos em dólar | Finnhub → Yahoo → Alpha Vantage | Finnhub: 60 por minuto; Alpha Vantage: 25 por dia |
| B3 | Yahoo → brapi (com `BRAPI_TOKEN`) → Alpha Vantage | Yahoo não é oficial e não publica limite |

Cada requisição tem timeout de 12 segundos (`fetchJson`); os símbolos de um
provedor são consultados um por vez, e a falha de um passa só ele ao próximo
provedor. Com os 13 símbolos atuais, uma execução faz cerca de 15 consultas,
cerca de 360 por dia: longe dos limites, exceto o Alpha Vantage, que só é
usado quando os anteriores falham.

## Decisões

### Onde roda o agendamento

- **Neon Functions não roda na região do banco.** O projeto está em
  `aws-sa-east-1` (São Paulo), e a API do Neon respondeu "platform functions
  not available for this project". As Functions existem hoje só em
  `aws-us-east-1`, `aws-us-east-2`, `aws-eu-central-1` e `aws-ap-southeast-1`;
- o `pg_cron` do Neon não serve: roda SQL, não chama APIs externas, e não roda
  com o compute suspenso, que no plano Free suspende depois de 5 minutos;
- por isso o job é um módulo comum (`syncQuotes`), sem dependência do Next.js,
  com três portas de entrada que fazem a mesma coisa:
  1. `pnpm quotes:sync`: o roteiro pelo terminal, usado localmente e pelo
     GitHub Actions;
  2. a função do Neon (`jobs/neon/quote-sync.ts`), num projeto do Neon só para
     jobs, numa região com Functions (`aws-us-east-1`), que conecta ao banco
     de São Paulo por `PORTFOLIO_DATABASE_URL`. Uma execução faz poucas
     consultas, e a distância (cerca de 120 ms por ida e volta) pesa pouco;
  3. o workflow do GitHub Actions (`.github/workflows/quote-sync.yml`), de
     reserva, só manual (`workflow_dispatch`) até ser escolhido;
- **configurações versionadas**: `jobs/neon/neon.ts` declara a função e o
  gatilho (cron `0 * * * *`, UTC) e é aplicado com `neon deploy`; o workflow
  do GitHub fica no repositório. Os segredos (conexão do banco e chaves dos
  provedores) ficam fora do Git, lidos no deploy;
- **Vercel Cron** fica de fora: no plano Hobby só roda uma vez por dia;
- as execuções simultâneas são seguras mesmo com duas portas ativas ao mesmo
  tempo (veja Concorrência).

Decisão do usuário em 2026-10-04, seguindo a recomendação: a função do Neon
num projeto de jobs em `aws-us-east-1` (`my-portifolio-jobs`,
`square-cell-51336542`, criado vazio no mesmo dia), dentro do plano Free (10 horas ativas, 400 em espera
e 1 milhão de invocações por mês; uma execução por hora gasta perto de 4 horas
em espera por mês). O GitHub Actions é gratuito no repositório público, mas
atrasa ou pula horários no pico e desliga os agendamentos depois de 60 dias
sem commits.

### Cadastro de tickers (`quote_symbols`)

Uma tabela nova, com o símbolo como chave, o mesmo usado por todas as tabelas
de cotação. Não há `ticker_id` substituto: ele duplicaria a chave que
`daily_quotes`, `market_quotes`, `manual_quotes` e o backup já usam.

| Coluna | Uso |
|---|---|
| `symbol` | chave primária |
| `instrument_type`, `base_currency` | escolhem a cadeia de provedores, antes lidos da cotação mais recente |
| `provider_id` | moeda da CoinGecko do símbolo, uma só para todos os usuários |
| `status` | `PENDING` (o job ainda não processou), `ACTIVE` (última busca deu certo), `ERROR` (última busca falhou) |
| `last_attempt_at`, `last_success_at` | última tentativa e último sucesso da cotação atual |
| `failure_count` | falhas seguidas; volta a zero no sucesso |
| `last_error_code`, `last_error_message` | motivo da última falha |
| `next_attempt_at` | quando tentar de novo depois de falhas (espera crescente) |
| `history_synced_until` | último mês com o histórico conferido; nulo enquanto o histórico não foi carregado |
| `history_attempted_at`, `history_error` | última tentativa do histórico e o erro, se houve |

Sem `SYNCING` nem `INACTIVE`:

- **`SYNCING`** não é preciso: só uma execução roda por vez (veja
  Concorrência), e um estado gravado ficaria preso se o processo morresse;
- **`INACTIVE`** é calculado, não gravado: o job só processa os símbolos em uso
  (posições da competência mais recente de algum usuário). Um símbolo sem uso
  para de ser consultado e mantém o histórico; quando volta a ser usado, o job
  busca só os meses que faltam (veja Histórico).

O cadastro acontece na inclusão de um ativo com ticker novo (status
`PENDING`). Símbolos em uso sem cadastro, como os de um backup restaurado,
são cadastrados pelo próprio job, com o tipo e a moeda da cotação mais
recente.

### O job (`syncQuotes`)

A cada execução:

1. reserva a execução (veja Concorrência) e escolhe os símbolos **devidos**,
   entre os em uso:
   - cotação atual: sem sucesso há 50 minutos ou mais e fora da espera de
     falha (`next_attempt_at`);
   - histórico: `history_synced_until` anterior ao mês passado e sem tentativa
     nas últimas 24 horas;
2. sem nada devido, encerra sem criar execução (`idle`);
3. busca as cotações atuais pelas cadeias existentes, no máximo 150 símbolos
   por execução, os mais atrasados primeiro, e grava como antes: o dia em
   `daily_quotes`, o mês corrente em `market_quotes`, a reprecificação das
   posições do mês corrente de cada usuário e a remoção das cotações à mão
   substituídas ([spec 028](028-quote-rules.md));
4. atualiza o cadastro de cada símbolo: sucesso zera as falhas; falha conta,
   guarda o motivo e espera 1, 2, 4 ou até 6 horas antes da próxima tentativa;
5. carrega o histórico dos símbolos devidos, no máximo 10 por execução:
   só os meses sem fechamento conhecido, do mês seguinte a
   `history_synced_until` (ou de 36 meses atrás) até o mês passado. Um mês
   conta como coberto quando tem cotação diária ou mensal própria nos últimos
   7 dias dele. Sem meses faltando, só avança `history_synced_until`, sem
   consultar provedor;
6. encerra a execução com o resultado de cada símbolo, como antes.

Idempotência: as linhas têm chaves únicas (`symbol + quote_date`,
`reference_date + symbol`); gravar de novo no mesmo dia substitui o valor do
dia, e o histórico só insere o que falta (`skipDuplicates`).

### Concorrência

Continua a reserva da [spec 020](020-daily-quotes.md): sob um bloqueio
consultivo de transação (`pg_advisory_xact_lock`), a execução confere se há
outra em andamento (`RUNNING`), marca como falha as paradas há mais de 10
minutos e cria a sua. Uma segunda execução ao mesmo tempo responde `busy` e
não consulta nada. Funciona pelo pooler do Neon (o bloqueio dura só a
transação) e dispensa trava por ticker.

### Retenção e compactação (análise)

Não há o que compactar nas cotações: `daily_quotes` já guarda só a última
cotação de cada dia, por causa da chave única com upsert. A compactação que o
usuário descreveu acontece na gravação, sem job noturno.

Estimativa, com cerca de 250 bytes por linha, índices incluídos:

| Símbolos | Horário (24 por dia) | Diário (atual) |
|---|---|---|
| 13 (hoje) | 114 mil linhas por ano, cerca de 28 MB | 4,7 mil linhas, cerca de 1,2 MB |
| 50 | 438 mil, cerca de 110 MB | 18 mil, cerca de 4,5 MB |
| 500 | 4,4 milhões, cerca de 1,1 GB | 183 mil, cerca de 45 MB |

O limite do plano Free do Neon é de 1 GB por branch. Guardar por hora não traz
nenhuma funcionalidade e consumiria esse limite com centenas de símbolos; o
diário cabe por décadas. Decisão: manter o diário indefinidamente, sem limpeza,
e não guardar por hora.

O que cresce por hora são as execuções (`quote_refresh_results`): com 13
símbolos, cerca de 114 mil linhas e 28 MB por ano. Com o job, a execução só é
criada quando há símbolo devido, ainda uma por hora. Fica registrado como
próxima medida, sem implementar agora: apagar execuções com mais de 90 dias
quando o banco passar da metade do limite. Nada usa execuções antigas além do
histórico de execuções do mês ([spec 046](046-run-history-and-nav-island.md)).

### Consulta da cotação atual

A chave única `(symbol, quote_date)` já é um índice B-tree que atende
`WHERE symbol = ? ORDER BY quote_date DESC LIMIT 1` por varredura reversa.
Não há `latest_quote` no cadastro: o índice basta, e as telas leem a cotação do
mês (`market_quotes`), que também tem índice único.

### Ticker novo e a interface

- a inclusão continua conferindo o ticker no provedor (uma consulta, com cache
  de duas horas): é o que valida o ticker e dá o preço da posição nova. O
  histórico de 36 meses sai da requisição e passa ao job;
- enquanto o histórico não foi carregado, a página da posição avisa que o
  histórico está sendo preparado e aparece na próxima atualização automática;
- a checagem de abertura continua, só com a virada de mês e as metas padrão:
  não consulta mais provedores. O navegador a chama a cada 5 minutos com o app
  visível (antes, uma vez por hora) e recarrega os dados quando o job grava
  cotações novas;
- o topo deixa de mostrar "Atualizando cotações…", porque a atualização não
  acontece mais na abertura. O horário da última atualização, o ponto vermelho
  e o aviso de falhas continuam, agora a partir da última execução do job; o
  aviso de falhas aparece uma vez por execução.

## Critérios de aceite

- abrir o app não consulta provedores de cotação;
- `pnpm quotes:sync` atualiza as cotações devidas, reprecifica o mês corrente
  e não cria execução quando nada está devido;
- duas execuções simultâneas: uma trabalha, a outra responde `busy`;
- a falha de um símbolo não impede os outros e fica registrada no cadastro,
  com espera antes da nova tentativa;
- um ticker novo fica `PENDING`, o job carrega o histórico e a página da posição
  avisa enquanto isso;
- a função do Neon responde a uma chamada de gatilho simulada localmente e
  recusa chamadas sem o cabeçalho do Neon;
- `pnpm check`, `pnpm build` e a suíte do Playwright passam.

## Referências

- [Cotações diárias e atualização ao abrir](020-daily-quotes.md)
- [Histórico de fechamento dos ativos novos](029-asset-price-history.md)
- [Provedores de cotação em cadeia](037-quote-provider-chains.md)
- [Cotações compartilhadas](051-shared-automatic-quotes.md)
- [Produção](../context/production.md)
- Neon: [Functions](https://neon.com/docs/compute/functions/overview),
  [Schedule a function](https://neon.com/docs/compute/functions/triggers/schedule),
  [neon.ts](https://neon.com/docs/reference/neon-ts)
