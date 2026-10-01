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
```

O comando usa o hash do arquivo para não duplicar uma carga já concluída. As
linhas são preservadas como JSON e os achados ficam vinculados ao mesmo lote.
O normalizador cria as instituições, contas, ativos, competências, posições e
cotações usadas pela aplicação. As duas operações são idempotentes.
