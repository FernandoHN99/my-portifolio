export function formatBrl(value: number, options?: { compact?: boolean }) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: options?.compact ? "compact" : "standard",
    maximumFractionDigits: options?.compact ? 1 : 2,
  }).format(value);
}

// Preço unitário com a precisão guardada, até oito casas, como a cotação do mês.
export function formatPriceBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

export function parseLocaleNumber(value: string) {
  const trimmed = value.trim().replace(/\s/g, "");
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

export function formatSharePercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatPercent(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: "exceptZero",
  }).format(value / 100);
}

export function formatMonthCompact(date: Date) {
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");

  return `${month.charAt(0).toLocaleUpperCase("pt-BR")}${month.slice(1)}/${String(
    date.getUTCFullYear(),
  ).slice(2)}`;
}

export function formatMonth(date: Date, short = false) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: short ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);

  return formatted.charAt(0).toLocaleUpperCase("pt-BR") + formatted.slice(1);
}
