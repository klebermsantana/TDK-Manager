import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { billings, payables, receivables, sales, suppliers } from "@/db/schema";
import {
  treasuryReconciliationAllocations,
  treasuryReconciliationSettlements,
  treasuryStatementTransactions,
} from "@/db/treasury-schema";

const stopWords = new Set([
  "para", "com", "sem", "por", "das", "dos", "uma", "que", "pix", "ted", "doc",
  "pagamento", "recebimento", "transferencia", "transfer", "banco", "bank",
]);

export type TreasuryLearningPattern = {
  direction: "inflow" | "outflow";
  movementType: string;
  counterpart: string;
  counterpartKey: string;
  bankText: string;
  normalizedBankText: string;
  bankTokens: string[];
  weight: number;
  confirmedAt: string;
  source: "allocation" | "settlement" | "legacy";
};

export const normalizeTreasuryLearningText = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function learningTokens(value: unknown) {
  return normalizeTreasuryLearningText(value)
    .split(/\s+/)
    .filter((item) => item.length >= 3 && !stopWords.has(item));
}

async function loadMovementCounterparts() {
  const db = getDb();
  const [receivableRows, billingRows, payableRows] = await Promise.all([
    db.select({
      id: receivables.id,
      companyName: sales.companyName,
    }).from(receivables)
      .innerJoin(billings, eq(receivables.billingId, billings.id))
      .innerJoin(sales, eq(billings.saleId, sales.id)),
    db.select({
      id: billings.id,
      companyName: sales.companyName,
    }).from(billings).innerJoin(sales, eq(billings.saleId, sales.id)),
    db.select({
      id: payables.id,
      supplierName: suppliers.name,
    }).from(payables).innerJoin(suppliers, eq(payables.supplierId, suppliers.id)),
  ]);

  const result = new Map<string, string>();
  receivableRows.forEach((item) => result.set(`receivable:${item.id}`, item.companyName));
  billingRows.forEach((item) => result.set(`billing:${item.id}`, item.companyName));
  payableRows.forEach((item) => result.set(`payable:${item.id}`, item.supplierName));
  return result;
}

export async function loadTreasuryLearningPatterns(bankAccountId: number) {
  const db = getDb();
  const [transactions, allocations, settlements, counterparts] = await Promise.all([
    db.select().from(treasuryStatementTransactions)
      .where(eq(treasuryStatementTransactions.bankAccountId, bankAccountId))
      .orderBy(desc(treasuryStatementTransactions.transactionDate), desc(treasuryStatementTransactions.id))
      .limit(1200),
    db.select().from(treasuryReconciliationAllocations)
      .where(eq(treasuryReconciliationAllocations.bankAccountId, bankAccountId))
      .orderBy(desc(treasuryReconciliationAllocations.matchedAt))
      .limit(1600),
    db.select().from(treasuryReconciliationSettlements)
      .where(eq(treasuryReconciliationSettlements.bankAccountId, bankAccountId))
      .orderBy(desc(treasuryReconciliationSettlements.createdAt))
      .limit(1600),
    loadMovementCounterparts(),
  ]);

  const transactionMap = new Map(transactions.map((item) => [item.id, item]));
  const settlementPairs = new Set(settlements.map((item) => `${item.statementTransactionId}:${item.movementType}:${item.movementId}`));
  const seen = new Set<string>();
  const patterns: TreasuryLearningPattern[] = [];

  const addPattern = (input: {
    transactionId: number;
    movementType: string;
    movementId: number;
    confirmedAt: string;
    source: "allocation" | "settlement" | "legacy";
    weight: number;
  }) => {
    const transaction = transactionMap.get(input.transactionId);
    const counterpart = counterparts.get(`${input.movementType}:${input.movementId}`);
    if (!transaction || !counterpart) return;
    const pair = `${input.transactionId}:${input.movementType}:${input.movementId}`;
    if (seen.has(pair)) return;
    seen.add(pair);
    const bankText = `${transaction.description} ${transaction.memo ?? ""} ${transaction.document ?? ""}`.trim();
    const normalizedBankText = normalizeTreasuryLearningText(bankText);
    const bankTokens = learningTokens(bankText);
    if (!normalizedBankText) return;
    patterns.push({
      direction: Number(transaction.amount) >= 0 ? "inflow" : "outflow",
      movementType: input.movementType,
      counterpart,
      counterpartKey: normalizeTreasuryLearningText(counterpart),
      bankText,
      normalizedBankText,
      bankTokens,
      weight: input.weight,
      confirmedAt: input.confirmedAt,
      source: input.source,
    });
  };

  for (const allocation of allocations) {
    const pair = `${allocation.statementTransactionId}:${allocation.movementType}:${allocation.movementId}`;
    const settled = settlementPairs.has(pair);
    addPattern({
      transactionId: allocation.statementTransactionId,
      movementType: allocation.movementType,
      movementId: allocation.movementId,
      confirmedAt: allocation.matchedAt,
      source: settled ? "settlement" : "allocation",
      weight: settled ? 1 : 0.65,
    });
  }

  for (const settlement of settlements) {
    addPattern({
      transactionId: settlement.statementTransactionId,
      movementType: settlement.movementType,
      movementId: settlement.movementId,
      confirmedAt: settlement.createdAt,
      source: "settlement",
      weight: 1,
    });
  }

  for (const transaction of transactions) {
    if (!transaction.matchedMovementType || !transaction.matchedMovementId || !transaction.matchedAt) continue;
    addPattern({
      transactionId: transaction.id,
      movementType: transaction.matchedMovementType,
      movementId: transaction.matchedMovementId,
      confirmedAt: transaction.matchedAt,
      source: "legacy",
      weight: 0.55,
    });
  }

  return {
    patterns,
    confirmations: patterns.length,
    counterparts: new Set(patterns.map((item) => item.counterpartKey)).size,
    settledConfirmations: patterns.filter((item) => item.source === "settlement").length,
  };
}

export function treasuryLearningBoost(
  bankText: string,
  counterpart: string,
  direction: "inflow" | "outflow",
  patterns: TreasuryLearningPattern[],
) {
  const counterpartKey = normalizeTreasuryLearningText(counterpart);
  const currentNormalized = normalizeTreasuryLearningText(bankText);
  const currentTokens = new Set(learningTokens(bankText));
  if (!counterpartKey || !currentNormalized || !currentTokens.size) return { score: 0, matches: 0, strongMatches: 0 };

  const scored = patterns
    .filter((pattern) => pattern.direction === direction && pattern.counterpartKey === counterpartKey)
    .map((pattern) => {
      const patternTokens = new Set(pattern.bankTokens);
      let shared = 0;
      for (const token of currentTokens) if (patternTokens.has(token)) shared += 1;
      const denominator = Math.max(1, Math.min(currentTokens.size, patternTokens.size));
      const overlap = shared / denominator;
      const exactText = currentNormalized === pattern.normalizedBankText;
      const containedText = currentNormalized.length >= 8 && pattern.normalizedBankText.length >= 8
        && (currentNormalized.includes(pattern.normalizedBankText) || pattern.normalizedBankText.includes(currentNormalized));
      let raw = shared >= 2 ? 7 + Math.min(9, shared * 2) : shared === 1 ? 3 : 0;
      if (overlap >= 0.6) raw += 4;
      if (containedText) raw += 5;
      if (exactText) raw += 6;
      return Math.min(22, raw * pattern.weight);
    })
    .filter((score) => score >= 2)
    .sort((a, b) => b - a);

  if (!scored.length) return { score: 0, matches: 0, strongMatches: 0 };
  const strongest = scored[0];
  const recurrenceBonus = Math.min(6, Math.max(0, scored.length - 1) * 1.5);
  return {
    score: Math.min(24, strongest + recurrenceBonus),
    matches: scored.length,
    strongMatches: scored.filter((score) => score >= 10).length,
  };
}
