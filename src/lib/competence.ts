// Competência das áreas pessoais (spec 082, comum a Recebimentos desde a spec
// 088): o mês do registro, guardado como o dia 1 numa coluna DATE (meia-noite
// UTC) e tratado aqui como "AAAA-MM". Não depende das competências da carteira.

export type Competence = string;

const KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const SHORT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const LONG_MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function isCompetence(value: string): value is Competence {
  const match = KEY.exec(value);
  return match !== null && Number(match[1]) >= 2000 && Number(match[1]) <= 2100;
}

export function competenceOf(date: Date): Competence {
  return date.toISOString().slice(0, 7);
}

export function competenceDate(competence: Competence) {
  const [year, month] = competence.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export function addCompetenceMonths(competence: Competence, amount: number): Competence {
  const [year, month] = competence.split("-").map(Number);
  return competenceOf(new Date(Date.UTC(year, month - 1 + amount, 1)));
}

/** Mês corrente no relógio local, como a virada de mês da carteira. */
export function currentCompetence(now = new Date()): Competence {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "Out/26". */
export function formatCompetence(competence: Competence) {
  const [year, month] = competence.split("-");
  return `${SHORT_MONTHS[Number(month) - 1]}/${year.slice(2)}`;
}

/** "Outubro de 2026". */
export function formatCompetenceLong(competence: Competence) {
  const [year, month] = competence.split("-");
  return `${LONG_MONTHS[Number(month) - 1]} de ${year}`;
}

/** "Out", o mês sem o ano, para os botões da faixa de competências. */
export function formatCompetenceMonth(competence: Competence) {
  return SHORT_MONTHS[Number(competence.split("-")[1]) - 1];
}

/**
 * Resumo de uma seleção de meses para um botão estreito: "Set/26", "Ago/26, Set/26",
 * "2026 inteiro" quando são os doze meses de um ano e "5 meses" nos demais casos.
 */
export function summarizeCompetences(selected: readonly string[]) {
  const months = [...new Set(selected)].sort();

  if (months.length === 0) return "";
  if (months.length === 12 && months.every((month) => month.slice(0, 4) === months[0].slice(0, 4))) {
    return `${months[0].slice(0, 4)} inteiro`;
  }
  if (months.length <= 3) return months.map(formatCompetence).join(", ");

  return `${months.length} meses`;
}
