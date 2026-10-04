# 063 — Conferência de ticker entre consulta e salvamento

Estado: implementada e validada localmente em 2026-10-04. Sem deploy.
Origem: erro informado pelo usuário ao incluir XRP e pedido de buscar o preço
atual na inclusão, deixando as cotações passadas para o cron.

## Problema observado

A rota `/api/quotes/ticker-check` guardava o resultado da conferência em um
`Map` global do processo, identificado por um UUID. A Server Action de
salvamento precisava encontrar aquele mesmo registro na memória. Módulos ou
funções distintos, uma nova instância e o reinício do servidor não compartilham
essa memória. O salvamento então podia informar “a conferência expirou” mesmo
logo após uma consulta válida.

## Decisões e implementação

- A conferência devolve um comprovante assinado com HMAC-SHA256 e
  `BETTER_AUTH_SECRET`, já configurado para a autenticação. Ele não depende de
  um cadastro temporário em memória nem exige migração do banco.
- O comprovante tem versão, finalidade específica, usuário, competência,
  tipo, símbolo, provedor, identificação da moeda/título, preço obtido pelo
  servidor, data da cotação, instante da consulta e vencimento de duas horas.
  O servidor confere a assinatura em tempo constante e valida estritamente o
  conteúdo, o usuário e a competência antes de utilizar o preço.
- Preços automáticos precisam ser positivos e finitos. Indisponibilidade do
  provedor continua permitindo a cotação manual, com preço automático nulo.
  Preços enviados separadamente pelo navegador não substituem o preço
  conferido.
- O cache das consultas ao provedor dura no máximo um minuto, evitando gastar
  consultas repetidas durante a digitação sem reaproveitar preços por duas
  horas. Esse cache otimiza consultas; não decide se o comprovante é válido.
- A data oficial do Tesouro e a identificação da CoinGecko são preservadas;
  datas de calendário não são convertidas novamente pelo fuso do servidor.
- Uma expiração real orienta a conferir o ticker novamente, preservando a
  possibilidade de recuperar o formulário. A recuperação visual pertence à
  [spec 066](066-guided-position-and-movement-dialogs.md).

## Cotação atual e histórico

A inclusão de um símbolo novo na competência atual usa o preço conferido pela
API, calcula o total pela quantidade e registra a cotação atual em
`market_quotes` e `daily_quotes`. Também registra o símbolo em `quote_symbols`
como `PENDING`, com a identificação do provedor para as buscas futuras.

O salvamento não busca nem insere cotações passadas. O cron da
[spec 053](053-scheduled-quote-sync.md) continua responsável por preparar o
histórico; `history_synced_until` e `history_attempted_at` permanecem nulos até
ele processar o símbolo. Uma competência passada mantém a exigência de preço
manual, para não aplicar o preço de hoje ao passado. Um símbolo já cotado na
competência continua usando a cotação existente.

## Critérios de aceite

- XRP conferido por uma instância pode ser salvo por outra, com o preço
  recebido do provedor, sem falsa expiração.
- Assinatura adulterada, usuário/competência diferentes, preço inválido ou
  comprovante realmente vencido são recusados.
- O ativo e o cadastro de cotações preservam a moeda CoinGecko conferida.
- A inclusão registra o preço atual e deixa o histórico pendente para o cron.
- Os testes de gravação só alcançam o schema separado, com usuários próprios.

## Verificação local

- `tests/unit/verified-ticker-token.test.ts`: quatro testes aprovados. Cobrem
  emissão/validação em processos distintos, integridade do preço, isolamento
  por usuário e competência, expiração, versão, tipos, datas e cotação manual.
- `tests/integration/ticker-position-save.test.ts`: aprovado no schema
  `tx_adjustments_063`, com consulta CoinGecko simulada em outro processo e
  gravação real no schema separado. Dez XRP a R$ 17,12345678 resultaram em
  R$ 171,23; o preço atual e `ripple` foram registrados, o símbolo ficou
  pendente e nenhuma cotação passada foi inserida. A suíte elimina apenas
  seus usuários/dados e é ignorada quando esse schema não está configurado.
- ESLint aprovado para os arquivos alterados nesta fatia; a tipagem do
  conjunto também passou após a integração das demais frentes desta revisão.
- Build local, 28 testes unitários conjuntos e a integração acima passaram
  também na conferência final das specs 063 a 066.
- As fontes de preço dessa integração foram simuladas; este teste não atesta
  disponibilidade ao vivo da CoinGecko. Nenhum dado da carteira real foi
  gravado.

Execução da integração, depois de criar o schema separado conforme a
[spec 042](042-data-backup.md):

```sh
DATABASE_URL="$(pnpm --silent db:test-schema url tx_adjustments_063)" \
  pnpm exec tsx --test tests/integration/ticker-position-save.test.ts
```

## Arquivos principais

- `src/modules/quotes/application/verified-ticker-token.ts`
- `src/modules/quotes/application/check-ticker.ts`
- `src/modules/portfolio/application/month-editing.ts` (`ensureMonthQuote`)
- `src/app/actions/edit-month.ts` (validação do comprovante)
