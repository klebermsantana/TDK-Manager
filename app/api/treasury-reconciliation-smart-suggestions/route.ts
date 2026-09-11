import { asc, desc, eq } from "drizzle-orm";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";
import { loadTreasuryLearningPatterns, treasuryLearningBoost } from "@/app/treasury-reconciliation-learning";
import { getDb } from "@/db";
import { billings, payables, receivables, sales, suppliers } from "@/db/schema";
import {
  treasuryBankAccounts,
  treasuryMovementAccounts,
  treasuryReconciliationAllocations,
  treasuryStatementTransactions,
} from "@/db/treasury-schema";

const centsEqual = (a: number, b: number) => Math.abs(a - b) <= 0.01;
const DAY = 86400000;
const stopWords = new Set(["para", "com", "sem", "por", "das", "dos", "uma", "que", "pix", "ted", "doc", "pagamento", "recebimento", "transferencia", "transfer", "banco", "bank"]);

type Candidate = {
  key: string;
  movementType: "receivable" | "billing" | "payable";
  movementId: number;
  direction: "inflow" | "outflow";
  document: string;
  counterpart: string;
  detail: string;
  totalAmount: number;
  remainingAmount: number;
  date: string | null;
  bankAccountId: number | null;
};

type Ranked = Candidate & {
  availableAmount: number;
  relevance: number;
  textScore: number;
  dateDiff: number | null;
  historyScore: number;
  historyMatches: number;
  historyStrongMatches: number;
};

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function tokens(value: unknown) {
  return new Set(normalize(value).split(/\s+/).filter((item) => item.length >= 3 && !stopWords.has(item)));
}

function dateDistance(a: string, b: string | null) {
  if (!b) return null;
  const left = Date.parse(`${a}T12:00:00Z`);
  const right = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.abs(Math.round((left - right) / DAY));
}

function textAffinity(bankText: string, candidate: Candidate) {
  const txTokens = tokens(bankText);
  if (!txTokens.size) return 0;
  const counterpartTokens = tokens(candidate.counterpart);
  const candidateTokens = tokens(`${candidate.counterpart} ${candidate.document} ${candidate.detail}`);
  let score = 0;
  for (const token of txTokens) {
    if (counterpartTokens.has(token)) score += 8;
    else if (candidateTokens.has(token)) score += 3;
  }
  const document = normalize(candidate.document).replace(/\s/g, "");
  const compactBank = normalize(bankText).replace(/\s/g, "");
  if (document.length >= 5 && compactBank.includes(document)) score += 16;
  return Math.min(36, score);
}

function dateAffinity(diff: number | null) {
  if (diff === null) return 0;
  if (diff === 0) return 24;
  if (diff <= 2) return 20;
  if (diff <= 7) return 14;
  if (diff <= 15) return 9;
  if (diff <= 30) return 5;
  if (diff <= 60) return 2;
  return 0;
}

async function loadCandidates(): Promise<Candidate[]> {
  const db = getDb();
  const [billingRows, receivableRows, payableRows, movementAccounts] = await Promise.all([
    db.select({
      id: billings.id,
      number: billings.number,
      total: billings.total,
      receivedAmount: billings.receivedAmount,
      dueDate: billings.dueDate,
      status: billings.status,
      companyName: sales.companyName,
      saleNumber: sales.number,
    }).from(billings).innerJoin(sales, eq(billings.saleId, sales.id)).orderBy(asc(billings.dueDate)),
    db.select({
      id: receivables.id,
      billingId: receivables.billingId,
      installmentNumber: receivables.installmentNumber,
      amount: receivables.amount,
      dueDate: receivables.dueDate,
      receivedAmount: receivables.receivedAmount,
      paymentDate: receivables.paymentDate,
      interest: receivables.interest,
      penalty: receivables.penalty,
      discount: receivables.discount,
      billingNumber: billings.number,
      companyName: sales.companyName,
      saleNumber: sales.number,
    }).from(receivables).innerJoin(billings, eq(receivables.billingId, billings.id)).innerJoin(sales, eq(billings.saleId, sales.id)).orderBy(asc(receivables.dueDate)),
    db.select({
      id: payables.id,
      supplierName: suppliers.name,
      groupNumber: payables.groupNumber,
      description: payables.description,
      installmentNumber: payables.installmentNumber,
      installmentCount: payables.installmentCount,
      amount: payables.amount,
      dueDate: payables.dueDate,
      paidAmount: payables.paidAmount,
      paymentDate: payables.paymentDate,
      status: payables.status,
    }).from(payables).innerJoin(suppliers, eq(payables.supplierId, suppliers.id)).orderBy(asc(payables.dueDate)),
    db.select().from(treasuryMovementAccounts),
  ]);

  const accountMap = new Map(movementAccounts.map((item) => [`${item.movementType}:${item.movementId}`, item.bankAccountId]));
  const billingIdsWithInstallments = new Set(receivableRows.map((item) => item.billingId));
  const result: Candidate[] = [];

  for (const row of receivableRows) {
    const totalAmount = Math.max(0, Number(row.amount) + Number(row.interest) + Number(row.penalty) - Number(row.discount));
    const remainingAmount = Math.max(0, totalAmount - Number(row.receivedAmount));
    if (remainingAmount <= 0.009) continue;
    result.push({
      key: `receivable:${row.id}`,
      movementType: "receivable",
      movementId: row.id,
      direction: "inflow",
      document: row.billingNumber,
      counterpart: row.companyName,
      detail: `Parcela ${row.installmentNumber} · ${row.saleNumber}`,
      totalAmount,
      remainingAmount,
      date: row.paymentDate ?? row.dueDate,
      bankAccountId: accountMap.get(`receivable:${row.id}`) ?? accountMap.get(`billing:${row.billingId}`) ?? null,
    });
  }

  for (const row of billingRows.filter((item) => !billingIdsWithInstallments.has(item.id) && item.status !== "cancelado")) {
    const totalAmount = Math.max(0, Number(row.total));
    const remainingAmount = Math.max(0, totalAmount - Number(row.receivedAmount));
    if (remainingAmount <= 0.009) continue;
    result.push({
      key: `billing:${row.id}`,
      movementType: "billing",
      movementId: row.id,
      direction: "inflow",
      document: row.number,
      counterpart: row.companyName,
      detail: `${row.saleNumber} · faturamento sem parcelas`,
      totalAmount,
      remainingAmount,
      date: row.dueDate,
      bankAccountId: accountMap.get(`billing:${row.id}`) ?? null,
    });
  }

  for (const row of payableRows.filter((item) => item.status !== "cancelado")) {
    const totalAmount = Math.max(0, Number(row.amount));
    const remainingAmount = Math.max(0, totalAmount - Number(row.paidAmount));
    if (remainingAmount <= 0.009) continue;
    result.push({
      key: `payable:${row.id}`,
      movementType: "payable",
      movementId: row.id,
      direction: "outflow",
      document: row.groupNumber,
      counterpart: row.supplierName,
      detail: `${row.description}${row.installmentCount > 1 ? ` · Parcela ${row.installmentNumber}/${row.installmentCount}` : ""}`,
      totalAmount,
      remainingAmount,
      date: row.paymentDate ?? row.dueDate,
      bankAccountId: accountMap.get(`payable:${row.id}`) ?? null,
    });
  }
  return result;
}

function buildSuggestions(target: number, ranked: Ranked[]) {
  type Combo = { items: Ranked[]; total: number; score: number; difference: number; type: "exact" | "near" | "partial"; reasons: string[] };
  const combos: Combo[] = [];
  const pool = ranked.slice(0, 18);

  const evaluate = (items: Ranked[], total: number) => {
    if (!items.length || total <= 0 || total > target + 0.01) return;
    const difference = Math.max(0, target - total);
    const coverage = target > 0 ? total / target : 0;
    if (coverage < 0.8 && difference > 1) return;
    const exact = centsEqual(total, target);
    const near = !exact && coverage >= 0.95;
    if (!exact && !near) return;
    const relevance = items.reduce((sum, item) => sum + item.relevance, 0) / items.length;
    const sameCounterpart = new Set(items.map((item) => normalize(item.counterpart))).size === 1;
    let score = exact ? 66 : 48 + coverage * 12;
    score += Math.min(28, relevance * 0.55);
    if (sameCounterpart && items.length > 1) score += 6;
    score -= Math.max(0, items.length - 2) * 1.5;
    const reasons: string[] = [];
    if (exact) reasons.push("fecha exatamente o valor do extrato");
    else reasons.push(`cobre ${(coverage * 100).toFixed(1)}% do valor`);
    if (sameCounterpart && items.length > 1) reasons.push("títulos do mesmo cliente/fornecedor");
    if (items.some((item) => item.textScore >= 8)) reasons.push("nome/documento compatível com o histórico bancário");
    if (items.every((item) => item.dateDiff !== null && item.dateDiff <= 15)) reasons.push("vencimentos próximos à data do banco");
    if (items.some((item) => item.historyScore >= 8)) reasons.push("padrão semelhante já foi confirmado em conciliações anteriores");
    if (items.some((item) => item.historyMatches >= 3)) reasons.push("histórico recorrente deste cliente/fornecedor nesta conta");
    combos.push({ items, total, score, difference, type: exact ? "exact" : "near", reasons });
  };

  const dfs = (start: number, chosen: Ranked[], total: number) => {
    if (chosen.length) evaluate(chosen, total);
    if (chosen.length >= 4) return;
    for (let index = start; index < pool.length; index += 1) {
      const item = pool[index];
      const next = total + item.availableAmount;
      if (next > target + 0.01) continue;
      dfs(index + 1, [...chosen, item], next);
    }
  };
  dfs(0, [], 0);

  for (const item of pool) {
    if (item.availableAmount <= target + 0.01) continue;
    const strongIdentity = item.textScore >= 8;
    const learnedIdentity = item.historyScore >= 8;
    const closeDate = item.dateDiff !== null && item.dateDiff <= 7;
    if (!strongIdentity && !learnedIdentity && !closeDate) continue;
    let score = 64 + Math.min(20, item.relevance * 0.45);
    if (strongIdentity) score += 6;
    if (learnedIdentity) score += Math.min(5, item.historyScore * 0.2);
    const reasons = ["valor compatível com pagamento parcial"];
    if (strongIdentity) reasons.push("cliente/fornecedor identificado no histórico bancário");
    if (learnedIdentity) reasons.push("padrão semelhante já foi confirmado em conciliações anteriores");
    if (item.historyMatches >= 3) reasons.push("histórico recorrente deste cliente/fornecedor nesta conta");
    if (closeDate) reasons.push("data próxima ao vencimento");
    combos.push({ items: [item], total: target, score: Math.min(92, score), difference: 0, type: "partial", reasons });
  }

  const deduped = new Map<string, Combo>();
  for (const combo of combos) {
    const key = `${combo.type}:${combo.items.map((item) => item.key).sort().join("|")}`;
    const current = deduped.get(key);
    if (!current || combo.score > current.score) deduped.set(key, combo);
  }

  return [...deduped.values()]
    .filter((item) => item.score >= 70)
    .sort((a, b) => b.score - a.score || a.difference - b.difference || a.items.length - b.items.length)
    .slice(0, 3)
    .map((combo, index) => ({
      id: `${combo.type}-${index + 1}-${combo.items.map((item) => item.movementId).join("-")}`,
      type: combo.type,
      confidence: combo.score >= 90 ? "alta" : combo.score >= 78 ? "media" : "baixa",
      score: Math.round(Math.min(99, combo.score)),
      total: Number(combo.total.toFixed(2)),
      difference: Number(combo.difference.toFixed(2)),
      reasons: combo.reasons,
      items: combo.items.map((item) => ({
        key: item.key,
        movementType: item.movementType,
        movementId: item.movementId,
        document: item.document,
        counterpart: item.counterpart,
        detail: item.detail,
        date: item.date,
        amount: Number((combo.type === "partial" ? target : item.availableAmount).toFixed(2)),
        availableAmount: Number(item.availableAmount.toFixed(2)),
        historyScore: Number(item.historyScore.toFixed(1)),
        historyMatches: item.historyMatches,
      })),
    }));
}

export async function GET(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureTreasuryTables();
    const bankAccountId = Number(new URL(request.url).searchParams.get("bankAccountId"));
    if (!Number.isInteger(bankAccountId) || bankAccountId <= 0) return Response.json({ error: "Selecione uma conta bancária." }, { status: 400 });
    const db = getDb();
    const [account] = await db.select().from(treasuryBankAccounts).where(eq(treasuryBankAccounts.id, bankAccountId)).limit(1);
    if (!account) return Response.json({ error: "Conta bancária não encontrada." }, { status: 404 });

    const [transactions, candidates, allocations, learning] = await Promise.all([
      db.select().from(treasuryStatementTransactions).where(eq(treasuryStatementTransactions.bankAccountId, bankAccountId)).orderBy(desc(treasuryStatementTransactions.transactionDate), desc(treasuryStatementTransactions.id)).limit(400),
      loadCandidates(),
      db.select().from(treasuryReconciliationAllocations),
      loadTreasuryLearningPatterns(bankAccountId),
    ]);

    const allocationsByTransaction = new Map<number, typeof allocations>();
    const allocatedByMovement = new Map<string, number>();
    for (const allocation of allocations) {
      const list = allocationsByTransaction.get(allocation.statementTransactionId) ?? [];
      list.push(allocation);
      allocationsByTransaction.set(allocation.statementTransactionId, list);
      const key = `${allocation.movementType}:${allocation.movementId}`;
      allocatedByMovement.set(key, (allocatedByMovement.get(key) ?? 0) + Number(allocation.allocatedAmount));
    }

    const rows = transactions.map((transaction) => {
      const currentAllocations = allocationsByTransaction.get(transaction.id) ?? [];
      const allocatedAmount = currentAllocations.reduce((sum, item) => sum + Number(item.allocatedAmount), 0);
      const statementAmount = Math.abs(Number(transaction.amount));
      const unallocatedAmount = Math.max(0, statementAmount - allocatedAmount);
      const currentKeys = new Set(currentAllocations.map((item) => `${item.movementType}:${item.movementId}`));
      const bankText = `${transaction.description} ${transaction.memo ?? ""} ${transaction.document ?? ""}`;
      const direction: "inflow" | "outflow" = transaction.amount >= 0 ? "inflow" : "outflow";
      const ranked = candidates
        .filter((candidate) => candidate.direction === direction)
        .filter((candidate) => !currentKeys.has(candidate.key))
        .filter((candidate) => candidate.bankAccountId === null || candidate.bankAccountId === bankAccountId)
        .map((candidate) => {
          const allocated = allocatedByMovement.get(candidate.key) ?? 0;
          const availableAmount = Math.min(candidate.remainingAmount, Math.max(0, candidate.totalAmount - allocated));
          const textScore = textAffinity(bankText, candidate);
          const dateDiff = dateDistance(transaction.transactionDate, candidate.date);
          const history = treasuryLearningBoost(bankText, candidate.counterpart, direction, learning.patterns);
          const relevance = textScore + dateAffinity(dateDiff) + (candidate.bankAccountId === bankAccountId ? 4 : 0) + history.score;
          return {
            ...candidate,
            availableAmount,
            textScore,
            dateDiff,
            relevance,
            historyScore: history.score,
            historyMatches: history.matches,
            historyStrongMatches: history.strongMatches,
          };
        })
        .filter((candidate) => candidate.availableAmount > 0.009)
        .filter((candidate) => candidate.textScore > 0 || candidate.historyScore > 0 || candidate.dateDiff === null || candidate.dateDiff <= 60)
        .sort((a, b) => b.relevance - a.relevance || (a.dateDiff ?? 999) - (b.dateDiff ?? 999) || (a.date ?? "9999").localeCompare(b.date ?? "9999"));

      const legacyMatched = Boolean(transaction.matchedMovementType && transaction.matchedMovementId && !currentAllocations.length);
      const suggestions = unallocatedAmount > 0.009 && !legacyMatched ? buildSuggestions(unallocatedAmount, ranked) : [];
      return {
        id: transaction.id,
        transactionDate: transaction.transactionDate,
        amount: transaction.amount,
        description: transaction.description,
        memo: transaction.memo,
        document: transaction.document,
        allocatedAmount: Number(allocatedAmount.toFixed(2)),
        unallocatedAmount: Number(unallocatedAmount.toFixed(2)),
        legacyMatched,
        currentAllocations: currentAllocations.map((item) => ({ movementType: item.movementType, movementId: item.movementId, amount: Number(item.allocatedAmount) })),
        suggestions,
      };
    }).filter((transaction) => transaction.suggestions.length > 0);

    return Response.json({ account, transactions: rows, summary: {
      transactionsWithSuggestions: rows.length,
      highConfidence: rows.filter((item) => item.suggestions.some((suggestion) => suggestion.confidence === "alta")).length,
      exactMatches: rows.filter((item) => item.suggestions.some((suggestion) => suggestion.type === "exact")).length,
      partialMatches: rows.filter((item) => item.suggestions.some((suggestion) => suggestion.type === "partial")).length,
      learnedConfirmations: learning.confirmations,
      learnedCounterparts: learning.counterparts,
      settledConfirmations: learning.settledConfirmations,
      historyBoosted: rows.filter((item) => item.suggestions.some((suggestion) => suggestion.items.some((candidate) => candidate.historyMatches > 0))).length,
    } });
  } catch (error) {
    console.error("treasury smart suggestions", error);
    return Response.json({ error: "Não foi possível calcular as sugestões inteligentes." }, { status: 503 });
  }
}
