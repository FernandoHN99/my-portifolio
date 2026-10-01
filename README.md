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

As chaves são lidas somente no servidor. O botão **Atualizar carteira** copia a
última competência para um rascunho e consulta os provedores naquele momento.
Se alguma cotação falhar, nenhum novo preço é aplicado parcialmente.
