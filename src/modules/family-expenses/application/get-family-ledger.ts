import { getFamilyDb } from "@/modules/family-expenses/application/family-db";
import { competenceOf, currentCompetence } from "@/modules/family-expenses/domain/competence";
import { compareEntries, type LedgerContact, type LedgerEntry, type LedgerSeries } from "@/modules/family-expenses/domain/ledger";
import { decimalToCents } from "@/modules/family-expenses/domain/money";

export type FamilyLedger = {
  contacts: LedgerContact[];
  series: LedgerSeries[];
  entries: LedgerEntry[];
  /** Mês corrente, sugerido nos lançamentos novos. */
  currentCompetence: string;
};

/**
 * Tudo o que a página de Gastos familiares mostra, em objetos simples: os
 * valores vão em centavos inteiros, e nada além do necessário sai do servidor.
 */
export async function getFamilyLedger(now = new Date()): Promise<FamilyLedger> {
  const prisma = await getFamilyDb();
  const [contacts, series, entries] = await Promise.all([
    prisma.familyContact.findMany({ select: { id: true, name: true } }),
    prisma.familySeries.findMany({
      select: {
        id: true,
        kind: true,
        description: true,
        direction: true,
        amount: true,
        firstCompetence: true,
        count: true,
        contactId: true,
      },
    }),
    prisma.familyEntry.findMany({
      select: {
        id: true,
        competence: true,
        description: true,
        contactId: true,
        direction: true,
        amount: true,
        status: true,
        seriesId: true,
        installment: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    contacts: contacts.sort(compareContacts),
    series: series.map(({ amount, firstCompetence, ...rest }) => ({
      ...rest,
      amountCents: decimalToCents(amount),
      firstCompetence: competenceOf(firstCompetence),
    })),
    entries: entries
      .map(({ amount, competence, createdAt, ...rest }) => ({
        ...rest,
        amountCents: decimalToCents(amount),
        competence: competenceOf(competence),
        createdAt: createdAt.toISOString(),
      }))
      .sort(compareEntries),
    currentCompetence: currentCompetence(now),
  };
}

/** Nomes em ordem alfabética, com "Outros", a opção genérica, por último. */
export function compareContacts(left: LedgerContact, right: LedgerContact) {
  const generic = Number(left.name === "Outros") - Number(right.name === "Outros");
  return generic || left.name.localeCompare(right.name, "pt-BR");
}
