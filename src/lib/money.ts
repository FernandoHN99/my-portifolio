// Dinheiro das áreas pessoais em centavos inteiros (spec 082, comum a
// Recebimentos desde a spec 088): somas e filtros exatos, sem ponto flutuante.
// O banco guarda DECIMAL(12,2), e a conversão é feita no texto, dígito a
// dígito. O maior valor aceito cabe com folga num inteiro exato do JavaScript.

export type Cents = number;

/** R$ 9.999.999,99: o maior valor de um campo (DECIMAL(12,2) com folga). */
export const MAX_AMOUNT_CENTS: Cents = 999_999_999;

/**
 * Centavos de um valor digitado: "1.234,56", "1234,56", "1234.56", "R$ 15" ou
 * "0,5". Recusa sinal, mais de duas casas e texto. Ponto sozinho com três
 * dígitos depois ("1.234") é separador de milhar, como no Brasil.
 */
export function parseAmountInput(text: string): Cents | null {
  const compact = text.replace(/R\$/gi, "").replace(/\s/g, "");

  if (compact === "") {
    return null;
  }

  let integer: string;
  let fraction = "";

  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(compact) || /^\d+(,\d{1,2})?$/.test(compact)) {
    const [whole, decimals = ""] = compact.split(",");
    integer = whole.replace(/\./g, "");
    fraction = decimals;
  } else if (/^\d+\.\d{1,2}$/.test(compact)) {
    [integer, fraction] = compact.split(".");
  } else {
    return null;
  }

  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Centavos de um decimal do banco ou do backup, como "1234.5" ou "-15.28". */
export function decimalToCents(value: { toString(): string } | string): Cents {
  const text = value.toString().trim();
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);

  if (!match) {
    throw new Error(`Valor decimal inválido: ${text}`);
  }

  const fraction = (match[3] ?? "").padEnd(2, "0");

  if (/[1-9]/.test(fraction.slice(2))) {
    throw new Error(`Valor com mais de duas casas decimais: ${text}`);
  }

  const cents = Number(match[2]) * 100 + Number(fraction.slice(0, 2));
  return match[1] ? -cents : cents;
}

/** Texto decimal para o Prisma: 123456 → "1234.56". */
export function centsToDecimal(cents: Cents) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.trunc(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.234,56; com `signed`, +R$ 1.234,56 ou −R$ 1.234,56. */
export function formatCents(cents: Cents, { signed = false }: { signed?: boolean } = {}) {
  const text = brl.format(Math.abs(cents) / 100);

  if (cents < 0) {
    return `−${text}`;
  }

  return signed && cents > 0 ? `+${text}` : text;
}

/** Valor para o campo do formulário: 123456 → "1.234,56". */
export function formatAmountInput(cents: Cents) {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
