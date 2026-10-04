import { z } from "zod";

import { fetchJson, ProviderRefusalError, QuoteHttpError } from "@/modules/quotes/infrastructure/http";

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
// útil, publicado no dia útil seguinte. Duas portas oficiais do Banco Central
// para a mesma série: a API JSON do Portal de Dados Abertos e, de reserva, o
// webservice SOAP do SGS. Em 2026-10-04 o endereço da API JSON
// (api.bcb.gov.br) deixou de existir no DNS público, e o webservice respondia.
const cdiSchema = z.array(z.object({ data: z.string(), valor: z.string() }));

/** Data como DD/MM/AAAA, o formato do SGS. */
function sgsDate(day: string) {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}

/** CDI diário entre dois dias (AAAA-MM-DD), inclusive, em percentual ao dia. */
export async function fetchCdiDaily(startDay: string, endDay: string) {
  try {
    return await fetchCdiDailyJson(startDay, endDay);
  } catch (error) {
    // O 404 é a resposta da API para um período sem valores, não uma falha.
    if (error instanceof QuoteHttpError && error.statusCode === 404) {
      throw error;
    }

    return fetchCdiDailySoap(startDay, endDay);
  }
}

async function fetchCdiDailyJson(startDay: string, endDay: string) {
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

const SGS_SOAP_URL = "https://www3.bcb.gov.br/wssgs/services/FachadaWSSGS";

/**
 * A mesma série pelo webservice SOAP do SGS (`getValoresSeriesXML`). A resposta
 * traz o XML da série escapado dentro do envelope, com datas como D/M/AAAA e
 * valores com ponto. Um período sem valores, como um fim de semana, volta como
 * falha SOAP "Value(s) not found", que aqui é uma lista vazia.
 */
export async function fetchCdiDailySoap(startDay: string, endDay: string) {
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pub="http://publico.ws.casosdeuso.sgs.pec.bcb.gov.br">' +
    "<soapenv:Body><pub:getValoresSeriesXML><codigosSeries><item>12</item></codigosSeries>" +
    `<dataInicio>${sgsDate(startDay)}</dataInicio><dataFim>${sgsDate(endDay)}</dataFim>` +
    "</pub:getValoresSeriesXML></soapenv:Body></soapenv:Envelope>";
  const response = await fetch(SGS_SOAP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '""' },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();

  if (text.includes("Value(s) not found")) {
    return [];
  }

  if (!response.ok) {
    throw new QuoteHttpError(response.status, `O Banco Central respondeu com HTTP ${response.status}.`);
  }

  const series = text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

  if (!/<SERIE ID='12'>/.test(series)) {
    throw new ProviderRefusalError("INVALID_RESPONSE", "O Banco Central respondeu sem a série do CDI.");
  }

  const items = [...series.matchAll(/<ITEM>([\s\S]*?)<\/ITEM>/g)].map((match) => match[1]);

  return items.flatMap((item) => {
    const date = /<DATA>(\d{1,2})\/(\d{1,2})\/(\d{4})<\/DATA>/.exec(item);
    const value = /<VALOR>([\d.,]+)<\/VALOR>/.exec(item);

    if (!date || !value || /<BLOQUEADO>true<\/BLOQUEADO>/.test(item)) {
      return [];
    }

    const [, day, month, year] = date;
    return [{ date: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, dailyPercent: value[1].replace(",", ".") }];
  });
}
