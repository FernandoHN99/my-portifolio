import type { Competence } from "@/lib/competence";
import type { Direction, EntryStatus } from "@/modules/family-expenses/domain/ledger";
import type { Cents } from "@/lib/money";

// Leitura da aba Gastos_Familia colada em texto (spec 084): sete colunas
// separadas por tabulação, com o mês em inglês ("Oct/23") e o dinheiro no
// formato brasileiro (" R$ 1.234,56 ", "-R$ 187,00 "). A conversão é explícita,
// sem depender do idioma da máquina, e não corrige nada por suposição: linhas
// que fogem das regras viram problemas para decisão do usuário.

export const SOURCE_HEADER = ["Data", "Nome", "Pessoa", "Tipo", "Valor", "Saldo", "Status"] as const;

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

export type SourceRow = {
  /** Linha no arquivo, contando o cabeçalho como 1. */
  line: number;
  competence: Competence;
  description: string;
  person: string;
  /** Tipo de origem, DEVE ou DEVO. */
  sourceType: "DEVE" | "DEVO";
  valueCents: Cents;
  balanceCents: Cents;
  status: EntryStatus;
};

export type SourceIssue = { line: number; message: string };

/** "Oct/23" → "2023-10"; nulo fora do formato. */
export function parseSourceMonth(text: string): Competence | null {
  const match = /^([A-Z][a-z]{2})\/(\d{2})$/.exec(text.trim());
  const month = match ? MONTHS[match[1]] : undefined;
  return match && month ? `20${match[2]}-${month}` : null;
}

/** " R$ 1.234,56 " → 123456; "-R$ 15,28 " → -1528; nulo fora do formato. */
export function parseSourceMoney(text: string): Cents | null {
  const match = /^\s*(-)?\s*R\$\s*(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*$/.exec(text);

  if (!match) {
    return null;
  }

  const cents = Number(match[2].replace(/\./g, "")) * 100 + Number(match[3]);
  return match[1] ? -cents : cents;
}

/** Linhas do arquivo e os problemas de formato, sem descartar nenhuma. */
export function parseSourceSheet(text: string): { rows: SourceRow[]; issues: SourceIssue[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const issues: SourceIssue[] = [];
  const rows: SourceRow[] = [];

  if (lines[0]?.split("\t").join("|") !== SOURCE_HEADER.join("|")) {
    return { rows, issues: [{ line: 1, message: `Cabeçalho diferente de ${SOURCE_HEADER.join(", ")}.` }] };
  }

  lines.slice(1).forEach((content, index) => {
    const line = index + 2;

    if (content === "" && index === lines.length - 2) {
      return;
    }

    const fields = content.split("\t");

    if (fields.length !== SOURCE_HEADER.length) {
      issues.push({ line, message: `Esperadas ${SOURCE_HEADER.length} colunas, há ${fields.length}.` });
      return;
    }

    const [month, description, person, type, value, balance, status] = fields;
    const competence = parseSourceMonth(month);
    const valueCents = parseSourceMoney(value);
    const balanceCents = parseSourceMoney(balance);
    const problems = [
      competence ? null : `mês "${month}" fora do formato Mmm/AA`,
      description.trim() ? null : "descrição vazia",
      description === description.trim() ? null : "descrição com espaços nas pontas",
      person.trim() ? null : "pessoa vazia",
      type === "DEVE" || type === "DEVO" ? null : `tipo "${type}" diferente de DEVE ou DEVO`,
      valueCents === null ? `valor "${value}" fora do formato` : null,
      balanceCents === null ? `saldo "${balance}" fora do formato` : null,
      status === "OK" || status === "NOK" ? null : `status "${status}" diferente de OK ou NOK`,
    ].filter((problem): problem is string => problem !== null);

    if (problems.length > 0) {
      issues.push({ line, message: problems.join("; ") });
      return;
    }

    rows.push({
      line,
      competence: competence!,
      description,
      person,
      sourceType: type as "DEVE" | "DEVO",
      valueCents: valueCents!,
      balanceCents: balanceCents!,
      status: status === "OK" ? "SETTLED" : "PENDING",
    });
  });

  return { rows, issues };
}

/**
 * Decisão do usuário para um valor negativo da fonte (2026-10-07): trocar o tipo
 * e usar o valor positivo, mantendo o saldo da planilha. Vale só para a linha
 * descrita; outra linha negativa continua pendente de decisão.
 */
export type NegativeValueDecision = {
  line: number;
  competence: Competence;
  description: string;
  person: string;
  sourceType: "DEVE" | "DEVO";
  valueCents: Cents;
};

export type ConvertedRow = SourceRow & {
  direction: Direction;
  amountCents: Cents;
  /** A decisão aplicada, quando a linha precisou de uma. */
  decision: "swap-direction" | null;
};

/**
 * Converte as linhas: DEVE vira RECEIVABLE (+) e DEVO vira PAYABLE (−). Confere
 * o saldo de cada linha contra o sinal do tipo; valor zero ou negativo sem
 * decisão vira problema, sem valor absoluto nem inversão silenciosa.
 */
export function convertSourceRows(rows: readonly SourceRow[], decisions: readonly NegativeValueDecision[]) {
  const converted: ConvertedRow[] = [];
  const issues: SourceIssue[] = [];

  for (const row of rows) {
    const expected = row.sourceType === "DEVE" ? row.valueCents : -row.valueCents;

    if (row.balanceCents !== expected) {
      issues.push({ line: row.line, message: "O saldo não é o valor com o sinal do tipo." });
      continue;
    }

    if (row.valueCents === 0) {
      issues.push({ line: row.line, message: "Valor zero." });
      continue;
    }

    const direction: Direction = row.sourceType === "DEVE" ? "RECEIVABLE" : "PAYABLE";

    if (row.valueCents > 0) {
      converted.push({ ...row, direction, amountCents: row.valueCents, decision: null });
      continue;
    }

    const decided = decisions.find(
      (decision) =>
        decision.line === row.line &&
        decision.competence === row.competence &&
        decision.description === row.description &&
        decision.person === row.person &&
        decision.sourceType === row.sourceType &&
        decision.valueCents === row.valueCents,
    );

    if (!decided) {
      issues.push({ line: row.line, message: "Valor negativo sem decisão do usuário." });
      continue;
    }

    const swapped: Direction = direction === "RECEIVABLE" ? "PAYABLE" : "RECEIVABLE";
    const amountCents = -row.valueCents;
    const balance = swapped === "RECEIVABLE" ? amountCents : -amountCents;

    if (balance !== row.balanceCents) {
      issues.push({ line: row.line, message: "A troca do tipo não preserva o saldo." });
      continue;
    }

    converted.push({ ...row, direction: swapped, amountCents, decision: "swap-direction" });
  }

  return { converted, issues };
}

/** Grupos de linhas com os sete campos iguais: preservados, só relatados. */
export function identicalRows(rows: readonly SourceRow[]) {
  const groups = new Map<string, number[]>();

  for (const row of rows) {
    const key = [row.competence, row.description, row.person, row.sourceType, row.valueCents, row.balanceCents, row.status].join("\u0000");
    groups.set(key, [...(groups.get(key) ?? []), row.line]);
  }

  return [...groups.values()].filter((lines) => lines.length > 1);
}
