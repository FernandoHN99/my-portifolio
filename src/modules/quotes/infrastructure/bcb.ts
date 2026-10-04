import { z } from "zod";

import { fetchJson, ProviderRefusalError } from "@/modules/quotes/infrastructure/http";

// PTAX do Banco Central pela API Olinda (spec 037): oficial, sem chave. O
// dólar de um período inteiro vem numa única consulta, o que faz dela a fonte
// principal do histórico do câmbio e a reserva da AwesomeAPI no dia a dia.

const periodSchema = z.object({
  value: z.array(z.object({ cotacaoVenda: z.number().positive(), dataHoraCotacao: z.string() })),
});

/** Data como MM-DD-AAAA, o formato da API Olinda. */
function olindaDate(day: string) {
  const [year, month, date] = day.split("-");
  return `'${month}-${date}-${year}'`;
}

/** Cotação de venda do dólar em cada dia útil entre dois dias (AAAA-MM-DD). */
export async function fetchPtaxUsdPeriod(startDay: string, endDay: string) {
  const url = new URL(
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)",
  );
  url.searchParams.set("@dataInicial", olindaDate(startDay));
  url.searchParams.set("@dataFinalCotacao", olindaDate(endDay));
  url.searchParams.set("$format", "json");
  url.searchParams.set("$select", "cotacaoVenda,dataHoraCotacao");
  const payload = periodSchema.parse(await fetchJson(url));

  return payload.value.map((quote) => ({ day: quote.dataHoraCotacao.slice(0, 10), value: quote.cotacaoVenda }));
}

/** PTAX mais recente, dos últimos dez dias. */
export async function fetchPtaxUsdLatest(today: string) {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 10);
  const days = await fetchPtaxUsdPeriod(start.toISOString().slice(0, 10), today);
  const latest = days.at(-1);

  if (!latest) {
    throw new ProviderRefusalError("MISSING_QUOTE", "O Banco Central não publicou a PTAX nos últimos dias.");
  }

  return latest.value;
}

// CDI diário do SGS, série 12 (spec 060): percentual ao dia, um valor por dia
// útil, publicado no dia útil seguinte. Endereço oficial documentado no Portal
// de Dados Abertos do Banco Central; consultas de até dez anos.
const cdiSchema = z.array(z.object({ data: z.string(), valor: z.string() }));

/** Data como DD/MM/AAAA, o formato do SGS. */
function sgsDate(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

/** CDI diário entre dois dias (AAAA-MM-DD), inclusive, em percentual ao dia. */
export async function fetchCdiDaily(startDay: string, endDay: string) {
  const url = new URL("https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados");
  url.searchParams.set("formato", "json");
  url.searchParams.set("dataInicial", sgsDate(startDay));
  url.searchParams.set("dataFinal", sgsDate(endDay));
  const payload = cdiSchema.parse(await fetchJson(url));

  return payload.map((entry) => {
    const [date, month, year] = entry.data.split("/");
    return { date: `${year}-${month}-${date}`, dailyPercent: entry.valor.replace(",", ".") };
  });
}
