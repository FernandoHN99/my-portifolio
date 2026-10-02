# Meu portfólio

Aplicação pessoal para substituir as funcionalidades de
`raw_file/01-Investimentos.xlsm` de forma incremental e auditável.

## Requisitos

- Node.js 24.20.0;
- pnpm 11;
- Docker com Docker Compose.

O repositório inclui `.mise.toml` e `.nvmrc` para selecionar a versão
correta do Node.js. O Prisma 7 não oferece suporte ao Node.js 26.

## Ambiente local

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

A aplicação fica disponível em `http://localhost:3000`. O PostgreSQL é
publicado somente em `127.0.0.1`.

Depois de aplicar uma migração, rode `pnpm db:generate`, porque o Prisma 7
não regenera o cliente automaticamente, e reinicie o `pnpm dev`, que mantém o
cliente anterior em memória.

## Verificações

```bash
pnpm db:validate
pnpm db:generate
pnpm check
pnpm build
pnpm test:e2e
```

O teste do Playwright usa o Google Chrome local em desktop e em viewport
mobile. As specs e seu estado ficam em `.ai/specs/`.

A inclusão de posição com instituição, conta e ativo novos
([spec 026](.ai/specs/026-new-position-entities.md)) tem uma conferência do
servidor que checa tickers, grava inclusões e as desfaz, com os provedores de
cotação simulados. Ela grava no banco e só roda num banco descartável,
carregado como na importação inicial abaixo, cujo nome se repete em
`VERIFY_DISPOSABLE_DATABASE`:

```bash
DATABASE_URL=postgresql://.../my_portifolio_verify \
VERIFY_DISPOSABLE_DATABASE=my_portifolio_verify pnpm verify:new-position
```

## Importação inicial

Com o PostgreSQL ativo, importe as três tabelas-base do arquivo de referência:

```bash
pnpm import:excel
pnpm normalize:portfolio
pnpm normalize:allocations
```

O comando usa o hash do arquivo para não duplicar uma carga já concluída. As
linhas são preservadas como JSON e os achados ficam vinculados ao mesmo lote.
O normalizador cria as instituições, contas, ativos, competências, posições e
cotações usadas pela aplicação. A normalização de alocações vincula as
classificações por posição e importa as metas do Excel. As três operações são
idempotentes.

## Atualização de cotações

Preencha no `.env` apenas as chaves dos provedores usados pela carteira:

```dotenv
AWESOME_API_KEY=
COINGECKO_API_KEY=
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
```

As chaves são lidas somente no servidor. Ao abrir, o aplicativo cria as
competências que faltarem até o mês corrente e, se a última tentativa tiver
mais de uma hora, consulta os provedores; a seta do topo e o botão
**Atualizar cotações** da página **Cotações**, em Posições, consultam na hora.
Cada cotação obtida entra no histórico diário e recalcula a competência do mês
corrente; as que falharem mantêm o valor anterior e são avisadas pelo nome do
ativo. A página de cotações também permite editar as cotações de qualquer
competência e mostra o histórico das execuções.
