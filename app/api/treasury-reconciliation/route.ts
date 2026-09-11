import { and, asc, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { billings, payables, receivables, sales, suppliers } from "@/db/schema";
import {
  treasuryBankAccounts,
  treasuryMovementAccounts,
  treasuryStatementImports,
  treasuryStatementTransactions,
} from "@/db/treasury-schema";

const validMovementTypes = new Set(["receivable", "billing", "payable"]);
const validFileTypes = new Set(["ofx", "csv"]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type Candidate = {
  key: string;
  movementType: "receivable" | "billing" | "payable";
  movementId: number;
  direction: "inflow" | "outflow";
  document: string;
  counterpart: string;
  detail: string;
  amount: number;
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
    const received = Math.max(0, Number(row.receivedAmount));
    const amount = received > 0 ? received : Math.max(0, gross - received);
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
      date: row.paymentDate ?? row.dueDate,
      bankAccountId: accountFor("receivable", row.id, row.billingId),
    });
  });
  billingRows.filter((row) => !billingIdsWithInstallments.has(row.id) && row.status !== "cancelado").forEach((row) => {
    const received = Math.max(0, Number(row.receivedAmount));
    const amount = received > 0 ? received : Math.max(0, Number(row.total) - received);
    if (amount <= 0) return;
    candidates.push({
      key: `billing:${row.id}`,
      movementType: "billing",
      movementId: row.id,
      direction: "inflow",
      document: row.number,
      counterpart: row.companyName,
      detail: `${row.saleNumber} · faturamento`,
      amount,
      date: row.dueDate,
      bankAccountId: accountFor("billing", row.id),
    });
  });
  payableRows.filter((row) => row.status !== "cancelado").forEach((row) => {
    const paid = Math.max(0, Number(row.paidAmount));
    const amount = paid > 0 ? paid : Math.max(0, Number(row.amount) - paid);
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
      date: row.paymentDate ?? row.dueDate,
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

    const [imports, transactions, candidates, matchedRows] = await Promise.all([
      db.select().from(treasuryStatementImports).where(eq(treasuryStatementImports.bankAccountId, accountId)).orderBy(desc(treasuryStatementImports.createdAt)).limit(20),
      db.select().from(treasuryStatementTransactions).where(eq(treasuryStatementTransactions.bankAccountId, accountId)).orderBy(desc(treasuryStatementTransactions.transactionDate), desc(treasuryStatementTransactions.id)).limit(1000),
      loadCandidates(),
      db.select({ movementType: treasuryStatementTransactions.matchedMovementType, movementId: treasuryStatementTransactions.matchedMovementId })
        .from(treasuryStatementTransactions),
    ]);
    const usedKeys = new Set(matchedRows.filter((item) => item.movementType && item.movementId).map((item) => `${item.movementType}:${item.movementId}`));
    const candidateMap = new Map(candidates.map((item) => [item.key, item]));

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
      return { ...transaction, status, matched, suggestion: ambiguous ? null : suggestion, alternatives, amountDiff, dateDiff };
    });

    const summary = {
      total: rows.length,
      reconciled: rows.filter((item) => item.status === "reconciled").length,
      divergent: rows.filter((item) => item.status === "divergent").length,
      suggested: rows.filter((item) => item.status === "suggested").length,
      unmatched: rows.filter((item) => item.status === "unmatched").length,
      credits: rows.filter((item) => Number(item.amount) > 0).reduce((sum, item) => sum + Number(item.amount), 0),
      debits: rows.filter((item) => Number(item.amount) < 0).reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0),
    };
    return Response.json({ account, imports, transactions: rows, summary });
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

    if (action === "unmatch") {
      const [updated] = await db.update(treasuryStatementTransactions).set({
        matchedMovementType: null, matchedMovementId: null, matchedAt: null, matchedBy: null, matchMethod: null, updatedAt: new Date().toISOString(),
      }).where(eq(treasuryStatementTransactions.id, transactionId)).returning();
      return Response.json({ transaction: updated });
    }

    const movementType = clean(payload.movementType);
    const movementId = Number(payload.movementId);
    if (action !== "match" || !validMovementTypes.has(movementType) || !Number.isInteger(movementId) || movementId <= 0) {
      return Response.json({ error: "Selecione um lançamento do TDK Manager para conciliar." }, { status: 400 });
    }
    const candidates = await loadCandidates();
    const candidate = candidates.find((item) => item.movementType === movementType && item.movementId === movementId);
    if (!candidate || candidate.direction !== (transaction.amount >= 0 ? "inflow" : "outflow")) {
      return Response.json({ error: "O lançamento selecionado não é compatível com a movimentação bancária." }, { status: 400 });
    }
    if (candidate.bankAccountId !== null && candidate.bankAccountId !== transaction.bankAccountId) {
      return Response.json({ error: "Este lançamento já está vinculado a outra conta bancária." }, { status: 409 });
    }
    const [alreadyMatched] = await db.select({ id: treasuryStatementTransactions.id }).from(treasuryStatementTransactions)
      .where(and(eq(treasuryStatementTransactions.matchedMovementType, movementType), eq(treasuryStatementTransactions.matchedMovementId, movementId))).limit(1);
    if (alreadyMatched && alreadyMatched.id !== transactionId) return Response.json({ error: "Este lançamento do sistema já foi conciliado com outro item do extrato." }, { status: 409 });

    const [updated] = await db.update(treasuryStatementTransactions).set({
      matchedMovementType: movementType,
      matchedMovementId: movementId,
      matchedAt: new Date().toISOString(),
      matchedBy: auth.email,
      matchMethod: "manual",
      updatedAt: new Date().toISOString(),
    }).where(eq(treasuryStatementTransactions.id, transactionId)).returning();

    const whereAllocation = and(eq(treasuryMovementAccounts.movementType, movementType), eq(treasuryMovementAccounts.movementId, movementId));
    const [allocation] = await db.select().from(treasuryMovementAccounts).where(whereAllocation).limit(1);
    if (allocation) {
      if (allocation.bankAccountId !== transaction.bankAccountId) await db.update(treasuryMovementAccounts).set({ bankAccountId: transaction.bankAccountId, updatedAt: new Date().toISOString() }).where(eq(treasuryMovementAccounts.id, allocation.id));
    } else {
      await db.insert(treasuryMovementAccounts).values({ movementType, movementId, bankAccountId: transaction.bankAccountId });
    }
    return Response.json({ transaction: updated });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a conciliação." }, { status: 500 });
  }
}
