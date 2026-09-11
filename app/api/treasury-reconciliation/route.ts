import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { billings, payables, receivables, sales, suppliers } from "@/db/schema";
import {
  treasuryBankAccounts,
  treasuryMovementAccounts,
  treasuryReconciliationAudit,
  treasuryReconciliationSettlements,
  treasuryStatementImports,
  treasuryStatementTransactions,
} from "@/db/treasury-schema";

const validMovementTypes = new Set(["receivable", "billing", "payable"]);
const validFileTypes = new Set(["ofx", "csv"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const centsEqual = (a: number, b: number) => Math.abs(a - b) <= 0.01;

type Candidate = {
  key: string;
  movementType: "receivable" | "billing" | "payable";
  movementId: number;
  direction: "inflow" | "outflow";
  document: string;
  counterpart: string;
  detail: string;
  amount: number;
  remainingAmount: number;
  recordedAmount: number;
  date: string | null;
  bankAccountId: number | null;
};

const clean = (value: unknown) => String(value ?? "").trim();
const daysBetween = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000));

async function hashText(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function loadCandidates() {
  const db = getDb();
  const [billingRows, receivableRows, payableRows, allocations] = await Promise.all([
    db.select({
      id: billings.id,
      number: billings.number,
      total: billings.total,
      receivedAmount: billings.receivedAmount,
      dueDate: billings.dueDate,
      status: billings.status,
      companyName: sales.companyName,
      saleNumber: sales.number,
    }).from(billings).innerJoin(sales, eq(billings.saleId, sales.id)),
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
      status: receivables.status,
      billingNumber: billings.number,
      companyName: sales.companyName,
      saleNumber: sales.number,
    }).from(receivables).innerJoin(billings, eq(receivables.billingId, billings.id)).innerJoin(sales, eq(billings.saleId, sales.id)),
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
    }).from(payables).innerJoin(suppliers, eq(payables.supplierId, suppliers.id)),
    db.select().from(treasuryMovementAccounts),
  ]);

  const allocated = new Map(allocations.map((item) => [`${item.movementType}:${item.movementId}`, item.bankAccountId]));
  const accountFor = (type: string, id: number, billingId?: number) =>
    allocated.get(`${type}:${id}`) ?? (type === "receivable" && billingId ? allocated.get(`billing:${billingId}`) : null) ?? null;
  const billingIdsWithInstallments = new Set(receivableRows.map((item) => item.billingId));

  const candidates: Candidate[] = [];
  receivableRows.forEach((row) => {
    const gross = Math.max(0, Number(row.amount) + Number(row.interest) + Number(row.penalty) - Number(row.discount));
    const recordedAmount = Math.max(0, Number(row.receivedAmount));
    const remainingAmount = Math.max(0, gross - recordedAmount);
    const amount = remainingAmount > 0 ? remainingAmount : recordedAmount;
    if (amount <= 0) return;
    candidates.push({
      key: `receivable:${row.id}`,
      movementType: "receivable",
      movementId: row.id,
      direction: "inflow",
      document: row.billingNumber,
      counterpart: row.companyName,
      detail: `Parcela ${row.installmentNumber} · ${row.saleNumber}`,
      amount,
      remainingAmount,
      recordedAmount,
      date: remainingAmount > 0 ? row.dueDate : row.paymentDate ?? row.dueDate,
      bankAccountId: accountFor("receivable", row.id, row.billingId),
    });
  });
  billingRows.filter((row) => !billingIdsWithInstallments.has(row.id) && row.status !== "cancelado").forEach((row) => {
    const recordedAmount = Math.max(0, Number(row.receivedAmount));
    const remainingAmount = Math.max(0, Number(row.total) - recordedAmount);
    const amount = remainingAmount > 0 ? remainingAmount : recordedAmount;
    if (amount <= 0) return;
    candidates.push({
      key: `billing:${row.id}`,
      movementType: "billing",
      movementId: row.id,
      direction: "inflow",
      document: row.number,
      counterpart: row.companyName,
      detail: `${row.saleNumber} · faturamento sem parcelas`,
      amount,
      remainingAmount,
      recordedAmount,
      date: row.dueDate,
      bankAccountId: accountFor("billing", row.id),
    });
  });
  payableRows.filter((row) => row.status !== "cancelado").forEach((row) => {
    const recordedAmount = Math.max(0, Number(row.paidAmount));
    const remainingAmount = Math.max(0, Number(row.amount) - recordedAmount);
    const amount = remainingAmount > 0 ? remainingAmount : recordedAmount;
    if (amount <= 0) return;
    candidates.push({
      key: `payable:${row.id}`,
      movementType: "payable",
      movementId: row.id,
      direction: "outflow",
      document: row.groupNumber,
      counterpart: row.supplierName,
      detail: `${row.description}${row.installmentCount > 1 ? ` · Parcela ${row.installmentNumber}/${row.installmentCount}` : ""}`,
      amount,
      remainingAmount,
      recordedAmount,
      date: remainingAmount > 0 ? row.dueDate : row.paymentDate ?? row.dueDate,
      bankAccountId: accountFor("payable", row.id),
    });
  });
  return candidates;
}

function rankedCandidates(transaction: typeof treasuryStatementTransactions.$inferSelect, candidates: Candidate[], usedKeys: Set<string>) {
  const direction = transaction.amount >= 0 ? "inflow" : "outflow";
  const statementAmount = Math.abs(Number(transaction.amount));
  return candidates
    .filter((item) => item.direction === direction)
    .filter((item) => item.bankAccountId === null || item.bankAccountId === transaction.bankAccountId)
    .filter((item) => !usedKeys.has(item.key) || item.key === `${transaction.matchedMovementType}:${transaction.matchedMovementId}`)
    .map((item) => {
      const amountDiff = Math.abs(item.amount - statementAmount);
      const amountPct = amountDiff / Math.max(statementAmount, 1);
      const dateDiff = item.date ? daysBetween(transaction.transactionDate, item.date) : 999;
      let score = amountDiff <= 0.01 ? 70 : amountPct <= 0.005 ? 55 : amountPct <= 0.02 ? 35 : amountPct <= 0.05 ? 15 : 0;
      score += dateDiff === 0 ? 30 : dateDiff <= 2 ? 24 : dateDiff <= 5 ? 16 : dateDiff <= 10 ? 8 : 0;
      if (item.bankAccountId === transaction.bankAccountId) score += 4;
      return { ...item, amountDiff, dateDiff, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.amountDiff - b.amountDiff || a.dateDiff - b.dateDiff)
    .slice(0, 5);
}

async function validateCandidateForTransaction(
  transaction: typeof treasuryStatementTransactions.$inferSelect,
  movementType: string,
  movementId: number,
) {
  const candidates = await loadCandidates();
  const candidate = candidates.find((item) => item.movementType === movementType && item.movementId === movementId);
  if (!candidate || candidate.direction !== (transaction.amount >= 0 ? "inflow" : "outflow")) {
    return { error: Response.json({ error: "O lançamento selecionado não é compatível com a movimentação bancária." }, { status: 400 }), candidate: null };
  }
  if (candidate.bankAccountId !== null && candidate.bankAccountId !== transaction.bankAccountId) {
    return { error: Response.json({ error: "Este lançamento já está vinculado a outra conta bancária." }, { status: 409 }), candidate: null };
  }
  return { error: null, candidate };
}

export async function GET(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureTreasuryTables();
    const accountId = Number(new URL(request.url).searchParams.get("bankAccountId"));
    if (!Number.isInteger(accountId) || accountId <= 0) return Response.json({ error: "Selecione uma conta bancária." }, { status: 400 });
    const db = getDb();
    const [account] = await db.select().from(treasuryBankAccounts).where(eq(treasuryBankAccounts.id, accountId)).limit(1);
    if (!account) return Response.json({ error: "Conta bancária não encontrada." }, { status: 404 });

    const [imports, transactions, candidates, matchedRows, settlements, audit] = await Promise.all([
      db.select().from(treasuryStatementImports).where(eq(treasuryStatementImports.bankAccountId, accountId)).orderBy(desc(treasuryStatementImports.createdAt)).limit(20),
      db.select().from(treasuryStatementTransactions).where(eq(treasuryStatementTransactions.bankAccountId, accountId)).orderBy(desc(treasuryStatementTransactions.transactionDate), desc(treasuryStatementTransactions.id)).limit(1000),
      loadCandidates(),
      db.select({ movementType: treasuryStatementTransactions.matchedMovementType, movementId: treasuryStatementTransactions.matchedMovementId })
        .from(treasuryStatementTransactions),
      db.select().from(treasuryReconciliationSettlements).where(eq(treasuryReconciliationSettlements.bankAccountId, accountId)),
      db.select().from(treasuryReconciliationAudit).where(eq(treasuryReconciliationAudit.bankAccountId, accountId)).orderBy(desc(treasuryReconciliationAudit.createdAt), desc(treasuryReconciliationAudit.id)).limit(50),
    ]);
    const usedKeys = new Set(matchedRows.filter((item) => item.movementType && item.movementId).map((item) => `${item.movementType}:${item.movementId}`));
    const candidateMap = new Map(candidates.map((item) => [item.key, item]));
    const settlementByTransaction = new Map(settlements.map((item) => [item.statementTransactionId, item]));

    const rows = transactions.map((transaction) => {
      const alternatives = rankedCandidates(transaction, candidates, usedKeys);
      const suggestion = alternatives[0] && alternatives[0].score >= 78 ? alternatives[0] : null;
      const second = alternatives[1];
      const ambiguous = Boolean(suggestion && second && second.score >= suggestion.score - 3);
      const matchedKey = transaction.matchedMovementType && transaction.matchedMovementId ? `${transaction.matchedMovementType}:${transaction.matchedMovementId}` : null;
      const matched = matchedKey ? candidateMap.get(matchedKey) ?? null : null;
      let status: "reconciled" | "divergent" | "suggested" | "unmatched" = "unmatched";
      let amountDiff: number | null = null;
      let dateDiff: number | null = null;
      if (matched) {
        amountDiff = Math.abs(Math.abs(Number(transaction.amount)) - matched.amount);
        dateDiff = matched.date ? daysBetween(transaction.transactionDate, matched.date) : null;
        status = amountDiff <= 0.01 && (dateDiff === null || dateDiff <= 7) ? "reconciled" : "divergent";
      } else if (suggestion && !ambiguous) status = "suggested";
      return { ...transaction, status, matched, suggestion: ambiguous ? null : suggestion, alternatives, amountDiff, dateDiff, settlement: settlementByTransaction.get(transaction.id) ?? null };
    });

    const summary = {
      total: rows.length,
      reconciled: rows.filter((item) => item.status === "reconciled").length,
      divergent: rows.filter((item) => item.status === "divergent").length,
      suggested: rows.filter((item) => item.status === "suggested").length,
      unmatched: rows.filter((item) => item.status === "unmatched").length,
      settled: rows.filter((item) => item.settlement).length,
      credits: rows.filter((item) => Number(item.amount) > 0).reduce((sum, item) => sum + Number(item.amount), 0),
      debits: rows.filter((item) => Number(item.amount) < 0).reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0),
    };
    return Response.json({ account, imports, transactions: rows, summary, audit });
  } catch {
    return Response.json({ error: "Não foi possível carregar a conciliação bancária." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  await ensureTreasuryTables();
  const db = getDb();
  let createdImportId: number | null = null;
  try {
    const payload = await request.json() as Record<string, unknown>;
    const bankAccountId = Number(payload.bankAccountId);
    const fileName = clean(payload.fileName) || "extrato";
    const fileType = clean(payload.fileType).toLowerCase();
    const input = Array.isArray(payload.transactions) ? payload.transactions : [];
    if (!Number.isInteger(bankAccountId) || bankAccountId <= 0 || !validFileTypes.has(fileType) || input.length < 1 || input.length > 5000) {
      return Response.json({ error: "Selecione uma conta e envie um arquivo OFX ou CSV válido." }, { status: 400 });
    }
    const [account] = await db.select().from(treasuryBankAccounts).where(eq(treasuryBankAccounts.id, bankAccountId)).limit(1);
    if (!account || !account.active) return Response.json({ error: "Selecione uma conta bancária ativa." }, { status: 400 });

    const seenExternal = new Set<string>();
    const normalized = input.map((raw, index) => {
      const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const transactionDate = clean(item.transactionDate);
      const amount = Number(item.amount);
      const description = clean(item.description) || clean(item.memo) || `Lançamento ${index + 1}`;
      if (!datePattern.test(transactionDate) || !Number.isFinite(amount) || amount === 0) throw new Error(`Linha ${index + 1}: data ou valor inválido.`);
      let externalId = clean(item.externalId) || null;
      if (externalId && seenExternal.has(externalId)) externalId = null;
      if (externalId) seenExternal.add(externalId);
      const balanceValue = item.balance === null || item.balance === undefined || item.balance === "" ? null : Number(item.balance);
      return {
        externalId,
        transactionDate,
        amount,
        description: description.slice(0, 500),
        memo: clean(item.memo).slice(0, 1000) || null,
        document: clean(item.document).slice(0, 120) || null,
        balance: balanceValue !== null && Number.isFinite(balanceValue) ? balanceValue : null,
      };
    });
    const periodStart = normalized.reduce((min, item) => !min || item.transactionDate < min ? item.transactionDate : min, "");
    const periodEnd = normalized.reduce((max, item) => !max || item.transactionDate > max ? item.transactionDate : max, "");
    const contentHash = await hashText(JSON.stringify({ bankAccountId, normalized }));
    const [existing] = await db.select({ id: treasuryStatementImports.id }).from(treasuryStatementImports)
      .where(and(eq(treasuryStatementImports.bankAccountId, bankAccountId), eq(treasuryStatementImports.contentHash, contentHash))).limit(1);
    if (existing) return Response.json({ error: "Este extrato já foi importado para esta conta." }, { status: 409 });

    const [created] = await db.insert(treasuryStatementImports).values({
      bankAccountId, fileName, fileType, contentHash, periodStart, periodEnd,
      transactionCount: normalized.length,
      importedBy: auth.email,
    }).returning();
    createdImportId = created.id;
    for (let index = 0; index < normalized.length; index += 100) {
      const batch = normalized.slice(index, index + 100).map((item) => ({ ...item, importId: created.id, bankAccountId }));
      await db.insert(treasuryStatementTransactions).values(batch);
    }
    return Response.json({ import: created, transactionCount: normalized.length }, { status: 201 });
  } catch (error) {
    if (createdImportId) await db.delete(treasuryStatementImports).where(eq(treasuryStatementImports.id, createdImportId)).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível importar o extrato." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryTables();
    const payload = await request.json() as Record<string, unknown>;
    const transactionId = Number(payload.transactionId);
    const action = clean(payload.action);
    if (!Number.isInteger(transactionId) || transactionId <= 0) return Response.json({ error: "Lançamento bancário inválido." }, { status: 400 });
    const db = getDb();
    const [transaction] = await db.select().from(treasuryStatementTransactions).where(eq(treasuryStatementTransactions.id, transactionId)).limit(1);
    if (!transaction) return Response.json({ error: "Lançamento bancário não encontrado." }, { status: 404 });

    const [activeSettlement] = await db.select().from(treasuryReconciliationSettlements)
      .where(eq(treasuryReconciliationSettlements.statementTransactionId, transactionId)).limit(1);

    if (action === "unmatch") {
      if (activeSettlement) return Response.json({ error: "Estorne a baixa financeira antes de desfazer esta conciliação." }, { status: 409 });
      const [updated] = await db.update(treasuryStatementTransactions).set({
        matchedMovementType: null, matchedMovementId: null, matchedAt: null, matchedBy: null, matchMethod: null, updatedAt: new Date().toISOString(),
      }).where(eq(treasuryStatementTransactions.id, transactionId)).returning();
      return Response.json({ transaction: updated });
    }

    if (action === "reverse-settlement") {
      if (!activeSettlement) return Response.json({ error: "Este lançamento não possui baixa assistida ativa." }, { status: 409 });
      const now = new Date().toISOString();
      const auditValues = {
        statementTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        movementType: activeSettlement.movementType,
        movementId: activeSettlement.movementId,
        action: "reverse",
        amount: activeSettlement.settlementAmount,
        previousAmount: activeSettlement.resultingAmount,
        resultingAmount: activeSettlement.previousAmount,
        previousStatus: activeSettlement.resultingStatus,
        resultingStatus: activeSettlement.previousStatus,
        paymentDate: activeSettlement.paymentDate,
        performedBy: auth.email,
      };

      if (activeSettlement.movementType === "receivable") {
        const [current] = await db.select().from(receivables).where(eq(receivables.id, activeSettlement.movementId)).limit(1);
        if (!current) return Response.json({ error: "A parcela vinculada não existe mais." }, { status: 409 });
        if (!centsEqual(Number(current.receivedAmount), Number(activeSettlement.resultingAmount))) {
          return Response.json({ error: "A parcela foi alterada depois da baixa assistida. Faça o estorno pelo financeiro para não sobrescrever alterações posteriores." }, { status: 409 });
        }
        const siblings = await db.select().from(receivables).where(eq(receivables.billingId, current.billingId));
        const totalAfter = siblings.reduce((sum, item) => sum + (item.id === current.id ? Number(activeSettlement.previousAmount) : Number(item.receivedAmount)), 0);
        const [billing] = await db.select().from(billings).where(eq(billings.id, current.billingId)).limit(1);
        const billingStatus = billing ? (totalAfter <= 0 ? "pendente" : totalAfter < Number(billing.total) ? "parcial" : "recebido") : "pendente";
        const queries = [
          db.update(receivables).set({
            receivedAmount: activeSettlement.previousAmount,
            paymentDate: activeSettlement.previousPaymentDate,
            status: activeSettlement.previousStatus,
            updatedAt: now,
          }).where(eq(receivables.id, current.id)),
          db.delete(treasuryReconciliationSettlements).where(eq(treasuryReconciliationSettlements.id, activeSettlement.id)),
          db.insert(treasuryReconciliationAudit).values(auditValues),
          db.update(treasuryStatementTransactions).set({ matchMethod: "manual", updatedAt: now }).where(eq(treasuryStatementTransactions.id, transaction.id)),
        ] as const;
        if (billing) {
          await db.batch([...queries, db.update(billings).set({ receivedAmount: totalAfter, status: billingStatus, updatedAt: now }).where(eq(billings.id, billing.id))]);
        } else {
          await db.batch(queries);
        }
      } else if (activeSettlement.movementType === "payable") {
        const [current] = await db.select().from(payables).where(eq(payables.id, activeSettlement.movementId)).limit(1);
        if (!current) return Response.json({ error: "A conta a pagar vinculada não existe mais." }, { status: 409 });
        if (!centsEqual(Number(current.paidAmount), Number(activeSettlement.resultingAmount))) {
          return Response.json({ error: "A conta foi alterada depois da baixa assistida. Faça o estorno pelo financeiro para não sobrescrever alterações posteriores." }, { status: 409 });
        }
        await db.batch([
          db.update(payables).set({
            paidAmount: activeSettlement.previousAmount,
            paymentDate: activeSettlement.previousPaymentDate,
            status: activeSettlement.previousStatus,
            updatedAt: now,
          }).where(eq(payables.id, current.id)),
          db.delete(treasuryReconciliationSettlements).where(eq(treasuryReconciliationSettlements.id, activeSettlement.id)),
          db.insert(treasuryReconciliationAudit).values(auditValues),
          db.update(treasuryStatementTransactions).set({ matchMethod: "manual", updatedAt: now }).where(eq(treasuryStatementTransactions.id, transaction.id)),
        ]);
      } else {
        return Response.json({ error: "Este tipo de movimento não possui estorno assistido." }, { status: 400 });
      }
      return Response.json({ reversed: true });
    }

    const movementType = clean(payload.movementType);
    const movementId = Number(payload.movementId);
    if (!validMovementTypes.has(movementType) || !Number.isInteger(movementId) || movementId <= 0) {
      return Response.json({ error: "Selecione um lançamento do TDK Manager para conciliar." }, { status: 400 });
    }
    const validation = await validateCandidateForTransaction(transaction, movementType, movementId);
    if (validation.error || !validation.candidate) return validation.error!;
    const candidate = validation.candidate;
    if (transaction.matchedMovementType && (transaction.matchedMovementType !== movementType || transaction.matchedMovementId !== movementId)) {
      return Response.json({ error: "Desfaça a conciliação atual antes de selecionar outro lançamento." }, { status: 409 });
    }
    const [alreadyMatched] = await db.select({ id: treasuryStatementTransactions.id }).from(treasuryStatementTransactions)
      .where(and(eq(treasuryStatementTransactions.matchedMovementType, movementType), eq(treasuryStatementTransactions.matchedMovementId, movementId))).limit(1);
    if (alreadyMatched && alreadyMatched.id !== transactionId) return Response.json({ error: "Este lançamento do sistema já foi conciliado com outro item do extrato." }, { status: 409 });

    const whereAllocation = and(eq(treasuryMovementAccounts.movementType, movementType), eq(treasuryMovementAccounts.movementId, movementId));
    const [allocation] = await db.select().from(treasuryMovementAccounts).where(whereAllocation).limit(1);
    const allocationQuery = allocation
      ? db.update(treasuryMovementAccounts).set({ bankAccountId: transaction.bankAccountId, updatedAt: new Date().toISOString() }).where(eq(treasuryMovementAccounts.id, allocation.id))
      : db.insert(treasuryMovementAccounts).values({ movementType, movementId, bankAccountId: transaction.bankAccountId });

    if (action === "match") {
      const [updated] = await db.update(treasuryStatementTransactions).set({
        matchedMovementType: movementType,
        matchedMovementId: movementId,
        matchedAt: new Date().toISOString(),
        matchedBy: auth.email,
        matchMethod: "manual",
        updatedAt: new Date().toISOString(),
      }).where(eq(treasuryStatementTransactions.id, transactionId)).returning();
      await allocationQuery;
      return Response.json({ transaction: updated });
    }

    if (action !== "settle") return Response.json({ error: "Ação de conciliação inválida." }, { status: 400 });
    if (activeSettlement) return Response.json({ error: "Este lançamento bancário já gerou uma baixa financeira." }, { status: 409 });
    if (movementType === "billing") {
      return Response.json({ error: "Gere as parcelas deste faturamento antes de usar a baixa assistida." }, { status: 409 });
    }

    const statementAmount = Math.abs(Number(transaction.amount));
    const paymentDate = transaction.transactionDate;
    const now = new Date().toISOString();
    const [settlementForMovement] = await db.select({ id: treasuryReconciliationSettlements.id }).from(treasuryReconciliationSettlements)
      .where(and(eq(treasuryReconciliationSettlements.movementType, movementType), eq(treasuryReconciliationSettlements.movementId, movementId))).limit(1);
    if (settlementForMovement) return Response.json({ error: "Este título já possui uma baixa assistida ativa em outro lançamento bancário." }, { status: 409 });

    if (movementType === "receivable") {
      const [current] = await db.select().from(receivables).where(eq(receivables.id, movementId)).limit(1);
      if (!current) return Response.json({ error: "Parcela não encontrada." }, { status: 404 });
      const target = Math.max(0, Number(current.amount) + Number(current.interest) + Number(current.penalty) - Number(current.discount));
      const previousAmount = Math.max(0, Number(current.receivedAmount));
      const remaining = Math.max(0, target - previousAmount);
      if (remaining <= 0.01) return Response.json({ error: "Esta parcela já está integralmente recebida." }, { status: 409 });
      if (!centsEqual(statementAmount, remaining)) {
        return Response.json({ error: `A baixa assistida exige o saldo integral restante da parcela (${remaining.toFixed(2)}). Para recebimento parcial, use a baixa manual.` }, { status: 409 });
      }
      const siblings = await db.select().from(receivables).where(eq(receivables.billingId, current.billingId));
      const totalAfter = siblings.reduce((sum, item) => sum + (item.id === current.id ? target : Number(item.receivedAmount)), 0);
      const [billing] = await db.select().from(billings).where(eq(billings.id, current.billingId)).limit(1);
      const billingStatus = billing ? (totalAfter <= 0 ? "pendente" : totalAfter < Number(billing.total) ? "parcial" : "recebido") : "pendente";
      const settlementValues = {
        statementTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        movementType,
        movementId,
        settlementAmount: statementAmount,
        previousAmount,
        resultingAmount: target,
        previousStatus: current.status,
        resultingStatus: "recebido",
        previousPaymentDate: current.paymentDate,
        paymentDate,
        settledBy: auth.email,
      };
      const auditValues = {
        statementTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        movementType,
        movementId,
        action: "settle",
        amount: statementAmount,
        previousAmount,
        resultingAmount: target,
        previousStatus: current.status,
        resultingStatus: "recebido",
        paymentDate,
        performedBy: auth.email,
      };
      const baseQueries = [
        db.insert(treasuryReconciliationSettlements).values(settlementValues),
        db.insert(treasuryReconciliationAudit).values(auditValues),
        db.update(receivables).set({ receivedAmount: target, paymentDate, status: "recebido", updatedAt: now }).where(eq(receivables.id, current.id)),
        db.update(treasuryStatementTransactions).set({
          matchedMovementType: movementType,
          matchedMovementId: movementId,
          matchedAt: now,
          matchedBy: auth.email,
          matchMethod: "settle",
          updatedAt: now,
        }).where(eq(treasuryStatementTransactions.id, transaction.id)),
        allocationQuery,
      ] as const;
      if (billing) {
        await db.batch([...baseQueries, db.update(billings).set({ receivedAmount: totalAfter, status: billingStatus, updatedAt: now }).where(eq(billings.id, billing.id))]);
      } else {
        await db.batch(baseQueries);
      }
      return Response.json({ settled: true, amount: statementAmount, paymentDate, status: "recebido" });
    }

    if (movementType === "payable") {
      const [current] = await db.select().from(payables).where(eq(payables.id, movementId)).limit(1);
      if (!current) return Response.json({ error: "Conta a pagar não encontrada." }, { status: 404 });
      if (current.status === "cancelado") return Response.json({ error: "Não é possível baixar uma conta cancelada." }, { status: 409 });
      const target = Math.max(0, Number(current.amount));
      const previousAmount = Math.max(0, Number(current.paidAmount));
      const remaining = Math.max(0, target - previousAmount);
      if (remaining <= 0.01) return Response.json({ error: "Esta conta já está integralmente paga." }, { status: 409 });
      if (!centsEqual(statementAmount, remaining)) {
        return Response.json({ error: `A baixa assistida exige o saldo integral restante da conta (${remaining.toFixed(2)}). Para pagamento parcial, use a baixa manual.` }, { status: 409 });
      }
      const settlementValues = {
        statementTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        movementType,
        movementId,
        settlementAmount: statementAmount,
        previousAmount,
        resultingAmount: target,
        previousStatus: current.status,
        resultingStatus: "pago",
        previousPaymentDate: current.paymentDate,
        paymentDate,
        settledBy: auth.email,
      };
      const auditValues = {
        statementTransactionId: transaction.id,
        bankAccountId: transaction.bankAccountId,
        movementType,
        movementId,
        action: "settle",
        amount: statementAmount,
        previousAmount,
        resultingAmount: target,
        previousStatus: current.status,
        resultingStatus: "pago",
        paymentDate,
        performedBy: auth.email,
      };
      await db.batch([
        db.insert(treasuryReconciliationSettlements).values(settlementValues),
        db.insert(treasuryReconciliationAudit).values(auditValues),
        db.update(payables).set({ paidAmount: target, paymentDate, status: "pago", updatedAt: now }).where(eq(payables.id, current.id)),
        db.update(treasuryStatementTransactions).set({
          matchedMovementType: movementType,
          matchedMovementId: movementId,
          matchedAt: now,
          matchedBy: auth.email,
          matchMethod: "settle",
          updatedAt: now,
        }).where(eq(treasuryStatementTransactions.id, transaction.id)),
        allocationQuery,
      ]);
      return Response.json({ settled: true, amount: statementAmount, paymentDate, status: "pago" });
    }

    return Response.json({ error: "Tipo de movimento não suportado para baixa assistida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error && /UNIQUE/i.test(error.message)
      ? "Este lançamento ou título já possui uma conciliação/baixa ativa. Atualize a tela e revise os vínculos."
      : "Não foi possível atualizar a conciliação.";
    return Response.json({ error: message }, { status: 500 });
  }
}
