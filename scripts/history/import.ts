import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { PortfolioMonthStatus, Prisma } from "../../src/generated/prisma/client";
import { MONTH_ROLLOVER_LOCK_KEY, QUOTE_REFRESH_LOCK_KEY } from "../../src/lib/advisory-locks";
import { getPrismaClient } from "../../src/lib/prisma";

// Passo pré-produção (.ai/context/pre-deploy.md): carrega no banco o histórico
// montado por `build.ts` em `data/history/output/`. Sem `--apply`, só confere
// os arquivos e mostra o que seria feito.
//
// Com `--apply`, numa única transação, substitui instituições, contas, ativos,
// competências, posições, rateios e cotações mensais pelo conteúdo dos CSVs.
// Preserva os planos de metas, os lotes da importação antiga do Excel, o
// histórico diário de cotações e as execuções da atualização de cotações (que
// voltam a apontar para a competência do dia delas). As execuções do fluxo
// antigo "Atualizar carteira" (`monthly_update_runs`) são apagadas, como o
// usuário autorizou em 2026-10-02.

const Decimal = Prisma.Decimal;
const OUTPUT = path.join(process.cwd(), "data/history/output");

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ";") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

async function readCsv(name: string) {
  const text = await readFile(path.join(OUTPUT, name), "utf8");
  const [header, ...lines] = text.split("\n").filter((line) => line.length > 0);
  const columns = parseCsvLine(header);
  return lines.map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ""]));
  });
}

const dec = (value: string) => new Decimal(value.replace(",", "."));
const optionalDec = (value: string) => (value ? dec(value) : null);
const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const monthDate = (value: string) => day(`${value}-01`);

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const [assets, positions, allocations, quotes, months] = await Promise.all([
    readCsv("ativos.csv"),
    readCsv("posicoes.csv"),
    readCsv("rateios.csv"),
    readCsv("cotacoes.csv"),
    readCsv("meses.csv"),
  ]);

  // Conferências dos arquivos antes de tocar no banco.
  const assetById = new Map(assets.map((asset) => [asset.ativo_id, asset]));
  const positionKeys = new Set<string>();
  const totals = new Map<string, Prisma.Decimal>();
  for (const position of positions) {
    if (!assetById.has(position.ativo_id)) {
      throw new Error(`Posição com ativo desconhecido: ${position.ativo_id}.`);
    }
    const key = `${position.competencia}|${position.instituicao}|${position.ativo_id}`;
    if (positionKeys.has(key)) {
      throw new Error(`Posição repetida: ${key}.`);
    }
    positionKeys.add(key);
    totals.set(position.competencia, (totals.get(position.competencia) ?? new Decimal(0)).plus(dec(position.total_brl)));
  }
  const weights = new Map<string, Prisma.Decimal>();
  for (const allocation of allocations) {
    const key = `${allocation.competencia}|${allocation.instituicao}|${allocation.ativo_id}`;
    if (!positionKeys.has(key)) {
      throw new Error(`Rateio sem posição: ${key}.`);
    }
    weights.set(key, (weights.get(key) ?? new Decimal(0)).plus(dec(allocation.peso)));
  }
  for (const key of positionKeys) {
    if (!weights.get(key)?.equals(1)) {
      throw new Error(`Rateio de ${key} soma ${weights.get(key)?.toFixed() ?? "0"}.`);
    }
  }
  for (const month of months) {
    if (!totals.get(month.competencia)?.equals(dec(month.total_brl))) {
      throw new Error(`Total de ${month.competencia} não confere com meses.csv.`);
    }
  }
  const monthlyQuotes = quotes.filter((quote) => quote.destino === "competência");
  const dailyQuotes = quotes.filter((quote) => quote.destino === "histórico diário");
  const institutions = [...new Set(positions.map((position) => position.instituicao))].sort();

  console.info(
    `Arquivos conferidos: ${months.length} competências, ${institutions.length} instituições, ${assets.length} ativos, ` +
      `${positions.length} posições, ${allocations.length} rateios, ${monthlyQuotes.length} cotações mensais e ` +
      `${dailyQuotes.length} fechamentos para o histórico diário.`,
  );

  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const before = {
    months: await prisma.portfolioMonth.count(),
    positions: await prisma.position.count(),
    assets: await prisma.asset.count(),
    quotes: await prisma.marketQuote.count(),
  };
  console.info(
    `Banco hoje: ${before.months} competências, ${before.positions} posições, ${before.assets} ativos, ${before.quotes} cotações mensais.`,
  );

  if (!apply) {
    console.info("Simulação: nada foi gravado. Rode com --apply para importar.");
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  await prisma.$transaction(
    async (transaction) => {
      // Nenhuma virada de mês nem atualização de cotações no meio da troca.
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${MONTH_ROLLOVER_LOCK_KEY})`;
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTE_REFRESH_LOCK_KEY})`;

      await transaction.monthlyUpdateRun.deleteMany();
      await transaction.position.deleteMany();
      await transaction.marketQuote.deleteMany();
      await transaction.portfolioMonth.deleteMany();
      await transaction.asset.deleteMany();
      await transaction.account.deleteMany();
      await transaction.institution.deleteMany();

      const institutionIds = new Map<string, string>();
      const accountIds = new Map<string, string>();
      for (const name of institutions) {
        const institution = await transaction.institution.create({
          data: { name, normalizedName: normalizeKey(name) },
          select: { id: true },
        });
        institutionIds.set(name, institution.id);
        const account = await transaction.account.create({
          data: { institutionId: institution.id, name: "Principal" },
          select: { id: true },
        });
        accountIds.set(name, account.id);
      }

      const assetIds = new Map<string, string>();
      for (const asset of assets) {
        const created = await transaction.asset.create({
          data: {
            normalizedKey: asset.chave,
            name: asset.nome,
            ticker: asset.ticker || null,
            quoteSymbol: asset.simbolo_cotacao || null,
            baseCurrency: asset.moeda_base,
            maturityDate: asset.vencimento ? day(asset.vencimento) : null,
            liquidity: asset.liquidez || null,
            quoteProviderId: asset.id_provedor || null,
          },
          select: { id: true },
        });
        assetIds.set(asset.ativo_id, created.id);
      }

      const monthIds = new Map<string, string>();
      for (const month of months) {
        const created = await transaction.portfolioMonth.create({
          data: {
            referenceDate: monthDate(month.competencia),
            status: month.status as PortfolioMonthStatus,
          },
          select: { id: true },
        });
        monthIds.set(month.competencia, created.id);
      }

      await transaction.position.createMany({
        data: positions.map((position) => ({
          portfolioMonthId: monthIds.get(position.competencia)!,
          accountId: accountIds.get(position.instituicao)!,
          assetId: assetIds.get(position.ativo_id)!,
          quantity: dec(position.quantidade),
          unitPriceBrl: optionalDec(position.cotacao_brl),
          exchangeRateBrl: optionalDec(position.dolar_brl),
          totalBrl: dec(position.total_brl),
          strategy: position.estrategia || null,
        })),
      });
      const createdPositions = await transaction.position.findMany({
        select: { id: true, portfolioMonthId: true, accountId: true, assetId: true },
      });
      const positionIds = new Map(
        createdPositions.map((position) => [`${position.portfolioMonthId}|${position.accountId}|${position.assetId}`, position.id]),
      );
      await transaction.positionAllocation.createMany({
        data: allocations.map((allocation) => ({
          positionId: positionIds.get(
            `${monthIds.get(allocation.competencia)}|${accountIds.get(allocation.instituicao)}|${assetIds.get(allocation.ativo_id)}`,
          )!,
          assetClass: allocation.classe,
          subclass: allocation.subclasse,
          duration: allocation.resgate,
          weight: dec(allocation.peso),
        })),
      });

      await transaction.marketQuote.createMany({
        data: monthlyQuotes.map((quote) => ({
          referenceDate: monthDate(quote.competencia),
          symbol: quote.simbolo,
          instrumentType: quote.tipo,
          baseCurrency: quote.moeda_base,
          valueBrl: dec(quote.valor_brl),
          quoteDate: quote.dia ? day(quote.dia) : null,
          carriedFrom: quote.repetida_de ? monthDate(quote.repetida_de) : null,
        })),
      });
      // Fechamentos dos meses sem posição no ativo: só no histórico diário,
      // como o histórico de 3 anos da spec 029. Nada existente é sobrescrito.
      const daily = await transaction.dailyQuote.createMany({
        data: dailyQuotes.map((quote) => ({
          symbol: quote.simbolo,
          quoteDate: day(quote.dia),
          instrumentType: quote.tipo,
          baseCurrency: quote.moeda_base,
          valueBrl: dec(quote.valor_brl),
          provider: quote.provedor.split(" ")[0],
          fetchedAt: now,
        })),
        skipDuplicates: true,
      });

      // As execuções de atualização voltam a apontar para a competência do dia.
      const runs = await transaction.quoteRefreshRun.findMany({ select: { id: true, quoteDate: true } });
      for (const run of runs) {
        const monthId = monthIds.get(run.quoteDate.toISOString().slice(0, 7));
        if (monthId) {
          await transaction.quoteRefreshRun.update({ where: { id: run.id }, data: { portfolioMonthId: monthId } });
        }
      }

      // Conferência final dentro da transação.
      for (const month of months) {
        const sum = await transaction.position.aggregate({
          where: { portfolioMonthId: monthIds.get(month.competencia) },
          _sum: { totalBrl: true },
        });
        if (!sum._sum.totalBrl?.equals(dec(month.total_brl))) {
          throw new Error(`Total gravado de ${month.competencia} não confere.`);
        }
      }
      console.info(`Histórico diário: ${daily.count} fechamentos novos.`);
    },
    { maxWait: 10_000, timeout: 180_000 },
  );

  console.info(
    `Importado: ${months.length} competências, ${positions.length} posições, ${allocations.length} rateios, ` +
      `${monthlyQuotes.length} cotações mensais.`,
  );
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
