# Job agendado das cotações

Fonte principal de como o job das cotações roda e é agendado
([spec 053](../.ai/specs/053-scheduled-quote-sync.md)). A regra do job (o que é
devido, espera depois de falhas, histórico) está na spec; aqui ficam as portas
de entrada, as configurações versionadas e os passos para ligar cada uma.

## Uma função, três portas

A escrita das cotações automáticas é só `syncQuotes`
(`src/modules/quotes/application/sync-quotes.ts`). O app não busca cotações:
lê o que o job gravou.

| Porta | Onde | Uso |
|---|---|---|
| `pnpm quotes:sync` | `scripts/quotes-sync.ts` | local, e o passo do GitHub Actions |
| Função do Neon `quotesync` | `jobs/neon/quote-sync.ts`, `jobs/neon/neon.ts` | agendamento em uso, de hora em hora |
| GitHub Actions | `.github/workflows/quote-sync.yml` | reserva, hoje só manual |

As três fazem a mesma coisa e podem coexistir: a execução é reservada sob um
bloqueio do Postgres, e uma segunda execução ao mesmo tempo sai com `busy`.
Rodar de novo não duplica dados; sem nada devido, sai com `idle` e não cria
execução.

Saída e código de saída: o roteiro e a função escrevem as mesmas linhas
(`describeQuoteSync`). Sai com erro (código 1 no terminal, HTTP 500 na função)
só quando o job não conseguiu rodar ou todas as cotações falharam; falhas de
alguns símbolos ficam registradas no cadastro e na execução.

## Local

```bash
pnpm quotes:sync
```

Usa o `DATABASE_URL` do `.env`. Para testar sem tocar nos dados, aponte para um
schema de teste: `DATABASE_URL="$(pnpm --silent db:test-schema url teste)"
pnpm quotes:sync`.

## Função do Neon (em uso)

O banco do app está em `aws-sa-east-1`, região que ainda não tem Neon
Functions. A função fica num projeto do Neon só para jobs, numa região com
Functions (`aws-us-east-1`, a mais próxima), e conecta ao banco de São Paulo
por `PORTFOLIO_DATABASE_URL`. O plano Free inclui 10 horas ativas, 400 horas em
espera e 1 milhão de invocações por mês; o job de hora em hora usa uma fração
disso.

`jobs/neon/neon.ts` declara a função `quotesync` e o gatilho `quotes-hourly`
(cron `0 * * * *`, UTC). Escolha do usuário em 2026-10-04, publicada no mesmo
dia no projeto `my-portifolio-jobs` (`square-cell-51336542`), branch `main`
(`br-old-dream-b8ysin0q`). O banco desse projeto não é usado.

Para publicar de novo (código novo do job ou chave nova):

1. a CLI do Neon com login: `npx neon auth` abre o navegador;
2. `.env.jobs` na raiz, fora do Git (`.env*` já é ignorado), com:
   - `PORTFOLIO_DATABASE_URL`: a conexão **pooled** do banco de produção
     (`neon connection-string main --project-id square-fire-07443748
     --database-name my_portifolio --pooled`), trocando `sslmode=require` por
     `sslmode=verify-full`, como na Vercel: com `require`, o `pg` avisa no log
     que o modo muda na próxima versão;
   - `COINGECKO_API_KEY`, `FINNHUB_API_KEY`, `ALPHA_VANTAGE_API_KEY` e, se
     houver, `BRAPI_TOKEN` e `AWESOME_API_KEY`;
3. empacotar e publicar:

   ```bash
   pnpm jobs:build
   cd jobs/neon && neon link --project-id square-cell-51336542 --branch main --no-env-pull
   neon deploy --env ../../.env.jobs --no-env-pull
   ```

   O `neon link` grava `jobs/neon/.neon`, ignorado pelo `.gitignore` da
   pasta; ele aponta para o projeto de jobs, nunca para o do banco;
4. conferir nos logs (`neon logs query --source function`) a execução com o
   horário do gatilho.

As migrações do banco rodam no build da Vercel: um job novo que dependa de
tabela nova vai ao ar depois do deploy do app.

O empacotamento é próprio (`jobs/neon/build.mjs`, com `bundler: "none"` no
`neon.ts`): o cliente do Prisma e o `pg` precisam de um `require` dentro do
módulo ESM, que o empacotamento padrão do Neon não põe. Conferido em
2026-10-04: o pacote de 5,8 MB roda fora do repositório e responde a um
gatilho simulado.

A função recusa chamadas sem o cabeçalho `X-Neon-Trigger-Invocation-Id`, que o
Neon remove de clientes externos.

## GitHub Actions (reserva)

O workflow roda `pnpm quotes:sync` com os segredos do repositório
(`PORTFOLIO_DATABASE_URL` e as chaves dos provedores). Está só manual
(`workflow_dispatch`); para agendar, descomente `schedule`. O repositório é
público, então os minutos são gratuitos, mas o GitHub atrasa ou pula horários
no pico e desliga agendamentos de repositórios sem commits há 60 dias.

## Fuso

O dia da cotação e o mês corrente seguem o relógio do processo. A função e o
workflow definem `TZ=America/Sao_Paulo`; localmente vale o fuso da máquina.
