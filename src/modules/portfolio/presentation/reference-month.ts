const MONTH_PARAM = /^(\d{4})-(\d{2})$/;

export function toMonthParam(referenceDate: Date) {
  return referenceDate.toISOString().slice(0, 7);
}

export function parseMonthParam(value: string | string[] | undefined): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = MONTH_PARAM.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, 1));
}

export function resolveSelectedMonth(
  available: { month: string; referenceDate: Date }[],
  value: string | string[] | undefined,
) {
  const requested = parseMonthParam(value);
  const match = requested
    ? available.find((entry) => entry.month === toMonthParam(requested))
    : undefined;

  return match ?? available.at(-1) ?? null;
}
