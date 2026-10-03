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

Os testes de interface rodam sobre os dados do banco e não gravam. Para
testar gravações, use um schema de teste no mesmo PostgreSQL:

```bash
pnpm db:test-schema create teste
```

`DATABASE_URL="$(pnpm --silent db:test-schema url teste)"` aponta qualquer
comando para ele, e `E2E_BASE_URL` leva o Playwright a um servidor já rodando
nesse schema.

## Dados

A forma oficial de carregar, levar e guardar os dados é o backup em JSON:
**Configuração → Backup dos dados** exporta e restaura tudo, e os comandos
abaixo fazem o mesmo pelo terminal. Os arquivos ficam em `backups/`, fora do
Git.

```bash
pnpm backup:export
pnpm backup:restore backups/<arquivo>.json --apply
```

Sem `--apply`, a restauração só confere o arquivo e mostra o resumo.

O formato do arquivo, as versões e como mudá-lo quando o modelo de dados
mudar estão em [docs/backup-format.md](docs/backup-format.md).

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
competência e mostra o histórico das execuções do mês.
