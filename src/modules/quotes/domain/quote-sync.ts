// Regras do job agendado de cotações (spec 053). Sem dependências de banco nem
// de rede.

import { addMonths, lastDayOf, toDateKey } from "@/modules/quotes/domain/calendar";
import { HISTORY_BACKFILL_MONTHS } from "@/modules/quotes/domain/history-backfill";

/**
 * A cotação atual fica devida 50 minutos depois do último sucesso: com o
 * agendamento de hora em hora, uma execução que começa alguns segundos antes da
 * anterior completar uma hora ainda busca de novo.
 */
export const QUOTE_DUE_AFTER_MS = 50 * 60 * 1000;
/** Histórico com falha só é tentado de novo depois de um dia. */
export const HISTORY_RETRY_AFTER_MS = 24 * 60 * 60 * 1000;
export const MAX_QUOTES_PER_RUN = 150;
export const MAX_HISTORIES_PER_RUN = 10;
/** Teto da espera entre tentativas de um símbolo com falhas seguidas. */
const MAX_BACKOFF_HOURS = 6;
/** Um mês está coberto quando tem cotação própria nos últimos dias dele. */
const CLOSING_TOLERANCE_DAYS = 7;

/** Espera depois de `failures` falhas seguidas: 1, 2, 4 e no máximo 6 horas. */
export function backoffUntil(now: Date, failures: number) {
  const hours = Math.min(2 ** Math.max(0, failures - 1), MAX_BACKOFF_HOURS);
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function isQuoteDue(
  symbol: { lastSuccessAt: Date | null; nextAttemptAt: Date | null },
  now: Date,
) {
  if (symbol.nextAttemptAt && symbol.nextAttemptAt > now) {
    return false;
  }

  return !symbol.lastSuccessAt || now.getTime() - symbol.lastSuccessAt.getTime() >= QUOTE_DUE_AFTER_MS;
}

/**
 * O histórico fica devido quando falta conferir algum mês já encerrado e a
 * última tentativa, se falhou, tem mais de um dia.
 */
export function isHistoryDue(
  symbol: { historySyncedUntil: Date | null; historyAttemptedAt: Date | null; historyError: string | null },
  currentMonth: Date,
  now: Date,
) {
  const previousMonth = addMonths(currentMonth, -1);

  if (symbol.historySyncedUntil && symbol.historySyncedUntil >= previousMonth) {
    return false;
  }

  return !(
    symbol.historyError &&
    symbol.historyAttemptedAt &&
    now.getTime() - symbol.historyAttemptedAt.getTime() < HISTORY_RETRY_AFTER_MS
  );
}

/**
 * Meses (AAAA-MM) cujo fechamento falta, do mês seguinte ao último conferido
 * (ou do início da janela de 36 meses) até o mês passado. `closingDays` traz o
 * dia mais recente com cotação própria de cada mês; um mês só conta como
 * coberto quando esse dia cai nos últimos dias do mês, como o último pregão.
 */
export function missingClosingMonths({
  currentMonth,
  syncedUntil,
  closingDays,
}: {
  currentMonth: Date;
  syncedUntil: Date | null;
  closingDays: Map<string, string>;
}) {
  const windowStart = addMonths(currentMonth, -HISTORY_BACKFILL_MONTHS);
  let month = syncedUntil && syncedUntil >= windowStart ? addMonths(syncedUntil, 1) : windowStart;
  const missing: string[] = [];

  while (month < currentMonth) {
    const key = toDateKey(month).slice(0, 7);
    const lastDay = lastDayOf(month);
    const threshold = toDateKey(new Date(lastDay.getTime() - (CLOSING_TOLERANCE_DAYS - 1) * 24 * 60 * 60 * 1000));
    const latest = closingDays.get(key);

    if (!latest || latest < threshold) {
      missing.push(key);
    }

    month = addMonths(month, 1);
  }

  return missing;
}
