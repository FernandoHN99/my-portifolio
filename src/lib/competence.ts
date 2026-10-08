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
