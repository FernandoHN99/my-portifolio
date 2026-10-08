import { addCompetenceMonths, type Competence } from "@/lib/competence";
import type { Direction, EntryStatus, SeriesKind } from "@/modules/family-expenses/domain/ledger";
import type { Cents } from "@/lib/money";

// Parcelas e meses gerados juntos (spec 083, regras do usuário em 2026-10-07):
// ao criar, a série gera já todas as competências, uma por mês a partir da
// primeira, todas pendentes. Depois, editar a série muda descrição, pessoa,
// tipo, valor, quantidade e mês inicial dos lançamentos pendentes; os acertados
// ficam como estão. Nada é deduzido de descrições importadas.

export const MAX_SERIES_COUNT = 120;

export type SeriesRequest = {
  kind: SeriesKind;
  description: string;
  contactId: string;
  direction: Direction;
  amountCents: Cents;
  firstCompetence: Competence;
  count: number;
};

export type PlannedEntry = { installment: number; competence: Competence };

/** As competências da série: a primeira e as seguintes, uma por mês. */
export function plannedEntries(firstCompetence: Competence, count: number): PlannedEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    installment: index + 1,
    competence: addCompetenceMonths(firstCompetence, index),
  }));
}

export type SeriesMember = { id: string; installment: number; status: EntryStatus };

export type SeriesEditPlan =
  | {
      ok: true;
      /** Pendentes que continuam na série e recebem os dados novos. */
      update: { id: string; installment: number; competence: Competence }[];
      /** Números novos, além da quantidade anterior. */
      create: PlannedEntry[];
      /** Pendentes além da quantidade nova. */
      remove: string[];
    }
  | { ok: false; message: string };

/**
 * O que muda ao editar a série. Os acertados nunca mudam nem saem: a série não
 * pode ficar menor que o maior número acertado, e o mês inicial só muda sem
 * acertados. Números que foram excluídos um a um antes não voltam; só os além
 * da quantidade anterior são criados.
 */
export function planSeriesEdit(
  members: readonly SeriesMember[],
  previous: { firstCompetence: Competence; count: number },
  next: { firstCompetence: Competence; count: number },
): SeriesEditPlan {
  const settled = members.filter((member) => member.status === "SETTLED");
  const highestSettled = Math.max(0, ...settled.map((member) => member.installment));

  if (next.count < highestSettled) {
    return {
      ok: false,
      message: `O lançamento ${highestSettled}/${previous.count} já foi acertado: a série precisa de pelo menos ${highestSettled}.`,
    };
  }

  if (next.firstCompetence !== previous.firstCompetence && settled.length > 0) {
    return { ok: false, message: "A série tem lançamentos acertados: o mês inicial não pode mudar." };
  }

  const pending = members.filter((member) => member.status === "PENDING");
  const existing = new Set(members.map((member) => member.installment));
  const competenceOf = (installment: number) => addCompetenceMonths(next.firstCompetence, installment - 1);

  return {
    ok: true,
    update: pending
      .filter((member) => member.installment <= next.count)
      .map((member) => ({ id: member.id, installment: member.installment, competence: competenceOf(member.installment) })),
    create: plannedEntries(next.firstCompetence, next.count).filter(
      (entry) => entry.installment > previous.count && !existing.has(entry.installment),
    ),
    remove: pending.filter((member) => member.installment > next.count).map((member) => member.id),
  };
}

/** Texto do resumo do formulário: "12 parcelas · Out/26 a Set/27". */
export function seriesSpan(firstCompetence: Competence, count: number) {
  return { first: firstCompetence, last: addCompetenceMonths(firstCompetence, count - 1) };
}
