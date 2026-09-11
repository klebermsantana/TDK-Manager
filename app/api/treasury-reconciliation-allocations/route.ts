import { and, desc, eq, ne } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { billings, payables, receivables, sales, suppliers } from "@/db/schema";
import {
  treasuryBankAccounts,
  treasuryMovementAccounts,
  treasuryReconciliationAllocations,
  treasuryReconciliationAudit,
  treasuryReconciliationSettlements,
  treasuryStatementTransactions,
} from "@/db/treasury-schema";

const validMovementTypes = new Set(["receivable", "billing", "payable"]);
const centsEqual = (a: number, b: number) => Math.abs(a - b) <= 0.01;
const clean = (value: unknown) => String(value ?? "").trim();

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
  recordedAmount: number;
  date: string | null;
  bankAccountId: number | null;
};

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
  const accountMap = new Map(movementAccounts.map((item) => [`${item.movementType}:${item.movementId}`, item.bankAccountId]));
  const billingIdsWithInstallments = new Set(receivableRows.map((item) => item.billingId));
  const rows: Candidate[] = [];

  for (const row of receivableRows) {
    const totalAmount = Math.max(0, Number(row.amount) + Number(row.interest) + Number(row.penalty) - Number(row.discount));
    const recordedAmount = Math.max(0, Number(row.receivedAmount));
    if (totalAmount <= 0) continue;
    rows.push({
      key: `receivable:${row.id}`,
      movementType: "receivable",
      movementId: row.id,
      direction: "inflow",
      document: row.billingNumber,
      counterpart: row.companyName,
      detail: `Parcela ${row.installmentNumber} · ${row.saleNumber}`,
      totalAmount,
      remainingAmount: Math.max(0, totalAmount - recordedAmount),
      recordedAmount,
      date: row.paymentDate ?? row.dueDate,
      bankAccountId: accountMap.get(`receivable:${row.id}`) ?? accountMap.get(`billing:${row.billingId}`) ?? null,
    });
  }
  for (const row of billingRows.filter((item) => !billingIdsWithInstallments.has(item.id) && item.status !== "cancelado")) {
    const totalAmount = Math.max(0, Number(row.total));
    const recordedAmount = Math.max(0, Number(row.receivedAmount));
    if (totalAmount <= 0) continue;
    rows.push({
      key: `billing:${row.id}`,
      movementType: "billing",
      movementId: row.id,
      direction: "inflow",
      document: row.number,
      counterpart: row.companyName,
      detail: `${row.saleNumber} · faturamento sem parcelas`,
      totalAmount,
      remainingAmount: Math.max(0, totalAmount - recordedAmount),
      recordedAmount,
      date: row.dueDate,
      bankAccountId: accountMap.get(`billing:${row.id}`) ?? null,
    });
  }
  for (const row of payableRows.filter((item) => item.status !== "cancelado")) {
    const totalAmount = Math.max(0, Number(row.amount));
    const recordedAmount = Math.max(0, Number(row.paidAmount));
    if (totalAmount <= 0) continue;
    rows.push({
      key: `payable:${row.id}`,
      movementType: "payable",
      movementId: row.id,
      direction: "outflow",
      document: row.groupNumber,
      counterpart: row.supplierName,
      detail: `${row.description}${row.installmentCount > 1 ? ` · Parcela ${row.installmentNumber}/${row.installmentCount}` : ""}`,
      totalAmount,
      remainingAmount: Math.max(0, totalAmount - recordedAmount),
      recordedAmount,
      date: row.paymentDate ?? row.dueDate,
      bankAccountId: accountMap.get(`payable:${row.id}`) ?? null,
    });
  }
  return rows;
}

async function keepMovementAccount(movementType: string, movementId: number, bankAccountId: number) {
  const db = getDb();
  const where = and(eq(treasuryMovementAccounts.movementType, movementType), eq(treasuryMovementAccounts.movementId, movementId));
  const [existing] = await db.select().from(treasuryMovementAccounts).where(where).limit(1);
  if (!existing) await db.insert(treasuryMovementAccounts).values({ movementType, movementId, bankAccountId });
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
    const [transactions, candidates, allocations, settlements] = await Promise.all([
      db.select().from(treasuryStatementTransactions).where(eq(treasuryStatementTransactions.bankAccountId, bankAccountId)).orderBy(desc(treasuryStatementTransactions.transactionDate), desc(treasuryStatementTransactions.id)).limit(1000),
      loadCandidates(),
      db.select().from(treasuryReconciliationAllocations),
      db.select().from(treasuryReconciliationSettlements),
    ]);
    const allocatedByMovement = new Map<string, number>();
    for (const item of allocations) {
      const key = `${item.movementType}:${item.movementId}`;
      allocatedByMovement.set(key, (allocatedByMovement.get(key) ?? 0) + Number(item.allocatedAmount));
    }
    const enrichedCandidates = candidates.map((candidate) => ({
      ...candidate,
      allocatedAmount: allocatedByMovement.get(candidate.key) ?? 0,
      availableAmount: Math.max(0, candidate.totalAmount - (allocatedByMovement.get(candidate.key) ?? 0)),
    }));
    const candidateMap = new Map(enrichedCandidates.map((item) => [item.key, item]));
    const allocationsByTransaction = new Map<number, typeof allocations>();
    const settlementsByTransaction = new Map<number, typeof settlements>();
    for (const item of allocations) {
      const list = allocationsByTransaction.get(item.statementTransactionId) ?? [];
      list.push(item);
      allocationsByTransaction.set(item.statementTransactionId, list);
    }
    for (const item of settlements) {
      const list = settlementsByTransaction.get(item.statementTransactionId) ?? [];
      list.push(item);
      settlementsByTransaction.set(item.statementTransactionId, list);
    }
    const rows = transactions.map((transaction) => {
      const txAllocations = allocationsByTransaction.get(transaction.id) ?? [];
      const txSettlements = settlementsByTransaction.get(transaction.id) ?? [];
      const settledKeys = new Set(txSettlements.map((item) => `${item.movementType}:${item.movementId}`));
      const detailedAllocations = txAllocations.map((item) => ({
        ...item,
        candidate: candidateMap.get(`${item.movementType}:${item.movementId}`) ?? null,
        settled: settledKeys.has(`${item.movementType}:${item.movementId}`),
        settlement: txSettlements.find((settlement) => settlement.movementType === item.movementType && settlement.movementId === item.movementId) ?? null,
      }));
      const allocatedAmount = detailedAllocations.reduce((sum, item) => sum + Number(item.allocatedAmount), 0);
      const statementAmount = Math.abs(Number(transaction.amount));
      return {
        id: transaction.id,
        bankAccountId: transaction.bankAccountId,
        transactionDate: transaction.transactionDate,
        amount: transaction.amount,
        allocations: detailedAllocations,
        settlements: txSettlements,
        allocatedAmount,
        unallocatedAmount: Math.max(0, statementAmount - allocatedAmount),
        fullyAllocated: centsEqual(statementAmount, allocatedAmount),
      };
    });
    return Response.json({ account, candidates: enrichedCandidates, transactions: rows });
  } catch {
    return Response.json({ error: "Não foi possível carregar os rateios da conciliação." }, { status: 503 });
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
    const action = clean(payload.action);
    const transactionId = Number(payload.transactionId);
    const db = getDb();

    if (action === "reverse") {
      const settlementId = Number(payload.settlementId);
      if (!Number.isInteger(settlementId) || settlementId <= 0) return Response.json({ error: "Baixa assistida inválida." }, { status: 400 });
      const [settlement] = await db.select().from(treasuryReconciliationSettlements).where(eq(treasuryReconciliationSettlements.id, settlementId)).limit(1);
      if (!settlement) return Response.json({ error: "Baixa assistida não encontrada." }, { status: 404 });
      const now = new Date().toISOString();
      const audit = {
        statementTransactionId: settlement.statementTransactionId,
        bankAccountId: settlement.bankAccountId,
        movementType: settlement.movementType,
        movementId: settlement.movementId,
        action: "reverse",
        amount: settlement.settlementAmount,
        previousAmount: settlement.resultingAmount,
        resultingAmount: settlement.previousAmount,
        previousStatus: settlement.resultingStatus,
        resultingStatus: settlement.previousStatus,
        paymentDate: settlement.paymentDate,
        performedBy: auth.email,
      };
      if (settlement.movementType === "receivable") {
        const [current] = await db.select().from(receivables).where(eq(receivables.id, settlement.movementId)).limit(1);
        if (!current) return Response.json({ error: "Parcela não encontrada." }, { status: 404 });
        if (!centsEqual(Number(current.receivedAmount), Number(settlement.resultingAmount))) return Response.json({ error: "Existe uma baixa posterior neste título. Estorne primeiro o pagamento mais recente." }, { status: 409 });
        const siblings = await db.select().from(receivables).where(eq(receivables.billingId, current.billingId));
        const totalAfter = siblings.reduce((sum, item) => sum + (item.id === current.id ? Number(settlement.previousAmount) : Number(item.receivedAmount)), 0);
        const [billing] = await db.select().from(billings).where(eq(billings.id, current.billingId)).limit(1);
        const queries = [
          db.update(receivables).set({ receivedAmount: settlement.previousAmount, paymentDate: settlement.previousPaymentDate, status: settlement.previousStatus, updatedAt: now }).where(eq(receivables.id, current.id)),
          db.delete(treasuryReconciliationSettlements).where(eq(treasuryReconciliationSettlements.id, settlement.id)),
          db.insert(treasuryReconciliationAudit).values(audit),
        ];
        if (billing) queries.push(db.update(billings).set({ receivedAmount: totalAfter, status: totalAfter <= 0 ? "pendente" : totalAfter < Number(billing.total) ? "parcial" : "recebido", updatedAt: now }).where(eq(billings.id, billing.id)));
        await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
      } else if (settlement.movementType === "payable") {
        const [current] = await db.select().from(payables).where(eq(payables.id, settlement.movementId)).limit(1);
        if (!current) return Response.json({ error: "Conta a pagar não encontrada." }, { status: 404 });
        if (!centsEqual(Number(current.paidAmount), Number(settlement.resultingAmount))) return Response.json({ error: "Existe uma baixa posterior neste título. Estorne primeiro o pagamento mais recente." }, { status: 409 });
        await db.batch([
          db.update(payables).set({ paidAmount: settlement.previousAmount, paymentDate: settlement.previousPaymentDate, status: settlement.previousStatus, updatedAt: now }).where(eq(payables.id, current.id)),
          db.delete(treasuryReconciliationSettlements).where(eq(treasuryReconciliationSettlements.id, settlement.id)),
          db.insert(treasuryReconciliationAudit).values(audit),
        ]);
      } else return Response.json({ error: "Este tipo de título não possui estorno financeiro." }, { status: 400 });
      return Response.json({ reversed: true });
    }

    if (!Number.isInteger(transactionId) || transactionId <= 0) return Response.json({ error: "Lançamento bancário inválido." }, { status: 400 });
    const [transaction] = await db.select().from(treasuryStatementTransactions).where(eq(treasuryStatementTransactions.id, transactionId)).limit(1);
    if (!transaction) return Response.json({ error: "Lançamento bancário não encontrado." }, { status: 404 });

    if (action === "save") {
      const rawAllocations = Array.isArray(payload.allocations) ? payload.allocations : [];
      if (rawAllocations.length > 100) return Response.json({ error: "Rateio excede o limite de 100 títulos por lançamento." }, { status: 400 });
      const requested = rawAllocations.map((raw) => {
        const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
        return { movementType: clean(item.movementType), movementId: Number(item.movementId), amount: Number(item.amount) };
      }).filter((item) => item.amount > 0.009);
      const seen = new Set<string>();
      for (const item of requested) {
        const key = `${item.movementType}:${item.movementId}`;
        if (!validMovementTypes.has(item.movementType) || !Number.isInteger(item.movementId) || item.movementId <= 0 || !Number.isFinite(item.amount) || item.amount <= 0 || seen.has(key)) return Response.json({ error: "Revise os títulos e valores informados no rateio." }, { status: 400 });
        seen.add(key);
      }
      const statementAmount = Math.abs(Number(transaction.amount));
      const totalRequested = requested.reduce((sum, item) => sum + item.amount, 0);
      if (totalRequested > statementAmount + 0.01) return Response.json({ error: "A soma do rateio não pode ultrapassar o valor do lançamento bancário." }, { status: 409 });
      const [candidates, allAllocations, currentAllocations, currentSettlements] = await Promise.all([
        loadCandidates(),
        db.select().from(treasuryReconciliationAllocations),
        db.select().from(treasuryReconciliationAllocations).where(eq(treasuryReconciliationAllocations.statementTransactionId, transactionId)),
        db.select().from(treasuryReconciliationSettlements).where(eq(treasuryReconciliationSettlements.statementTransactionId, transactionId)),
      ]);
      const candidateMap = new Map(candidates.map((item) => [item.key, item]));
      const lockedMap = new Map(currentSettlements.map((item) => [`${item.movementType}:${item.movementId}`, Number(item.settlementAmount)]));
      for (const [key, lockedAmount] of lockedMap) {
        const requestedItem = requested.find((item) => `${item.movementType}:${item.movementId}` === key);
        if (!requestedItem || !centsEqual(requestedItem.amount, lockedAmount)) return Response.json({ error: "Rateios que já geraram baixa não podem ser alterados. Estorne a baixa antes de editar." }, { status: 409 });
      }
      for (const item of requested) {
        const key = `${item.movementType}:${item.movementId}`;
        const candidate = candidateMap.get(key);
        if (!candidate || candidate.direction !== (transaction.amount >= 0 ? "inflow" : "outflow")) return Response.json({ error: `O título ${key} não é compatível com este lançamento bancário.` }, { status: 400 });
        const allocatedElsewhere = allAllocations.filter((allocation) => allocation.statementTransactionId !== transactionId && allocation.movementType === item.movementType && allocation.movementId === item.movementId).reduce((sum, allocation) => sum + Number(allocation.allocatedAmount), 0);
        if (item.amount > Math.max(0, candidate.totalAmount - allocatedElsewhere) + 0.01) return Response.json({ error: `${candidate.document} não possui saldo de conciliação suficiente para este rateio.` }, { status: 409 });
      }
      const now = new Date().toISOString();
      const deleteQueries = currentAllocations.filter((item) => !lockedMap.has(`${item.movementType}:${item.movementId}`)).map((item) => db.delete(treasuryReconciliationAllocations).where(eq(treasuryReconciliationAllocations.id, item.id)));
      const insertQueries = requested.filter((item) => !lockedMap.has(`${item.movementType}:${item.movementId}`)).map((item) => db.insert(treasuryReconciliationAllocations).values({ statementTransactionId: transactionId, bankAccountId: transaction.bankAccountId, movementType: item.movementType, movementId: item.movementId, allocatedAmount: Number(item.amount.toFixed(2)), matchedBy: auth.email, matchedAt: now, updatedAt: now }));
      const legacy = requested.length === 1 && centsEqual(totalRequested, statementAmount) ? requested[0] : null;
      const updateTransaction = db.update(treasuryStatementTransactions).set({ matchedMovementType: legacy?.movementType ?? null, matchedMovementId: legacy?.movementId ?? null, matchedAt: requested.length ? now : null, matchedBy: requested.length ? auth.email : null, matchMethod: requested.length ? (requested.length > 1 ? "split" : "allocation") : null, updatedAt: now }).where(eq(treasuryStatementTransactions.id, transactionId));
      const queries = [...deleteQueries, ...insertQueries, updateTransaction];
      if (queries.length) await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
      for (const item of requested) await keepMovementAccount(item.movementType, item.movementId, transaction.bankAccountId);
      return Response.json({ saved: true, allocatedAmount: totalRequested, unallocatedAmount: Math.max(0, statementAmount - totalRequested) });
    }

    if (action === "settle") {
      const [allocations, settlements] = await Promise.all([
        db.select().from(treasuryReconciliationAllocations).where(eq(treasuryReconciliationAllocations.statementTransactionId, transactionId)),
        db.select().from(treasuryReconciliationSettlements).where(eq(treasuryReconciliationSettlements.statementTransactionId, transactionId)),
      ]);
      const settledKeys = new Set(settlements.map((item) => `${item.movementType}:${item.movementId}`));
      const pending = allocations.filter((item) => !settledKeys.has(`${item.movementType}:${item.movementId}`));
      if (!pending.length) return Response.json({ error: "Não existem rateios pendentes de baixa neste lançamento." }, { status: 409 });
      if (pending.some((item) => item.movementType === "billing")) return Response.json({ error: "Existe faturamento sem parcelas no rateio. Gere as parcelas antes de executar as baixas." }, { status: 409 });
      const now = new Date().toISOString();
      const queries: any[] = [];
      const billingTotals = new Map<number, { billing: typeof billings.$inferSelect; totalAfter: number }>();

      for (const item of pending) {
        const amount = Number(item.allocatedAmount);
        if (item.movementType === "receivable") {
          const [current] = await db.select().from(receivables).where(eq(receivables.id, item.movementId)).limit(1);
          if (!current) return Response.json({ error: "Uma das parcelas do rateio não existe mais." }, { status: 409 });
          const target = Math.max(0, Number(current.amount) + Number(current.interest) + Number(current.penalty) - Number(current.discount));
          const previousAmount = Math.max(0, Number(current.receivedAmount));
          const remaining = Math.max(0, target - previousAmount);
          if (amount > remaining + 0.01) return Response.json({ error: `O rateio de ${amount.toFixed(2)} ultrapassa o saldo atual da parcela.` }, { status: 409 });
          const resultingAmount = Math.min(target, previousAmount + amount);
          const resultingStatus = resultingAmount <= 0 ? "aberto" : resultingAmount < target - 0.01 ? "parcial" : "recebido";
          queries.push(
            db.update(receivables).set({ receivedAmount: resultingAmount, paymentDate: transaction.transactionDate, status: resultingStatus, updatedAt: now }).where(eq(receivables.id, current.id)),
            db.insert(treasuryReconciliationSettlements).values({ statementTransactionId: transactionId, bankAccountId: transaction.bankAccountId, movementType: item.movementType, movementId: item.movementId, settlementAmount: amount, previousAmount, resultingAmount, previousStatus: current.status, resultingStatus, previousPaymentDate: current.paymentDate, paymentDate: transaction.transactionDate, settledBy: auth.email }),
            db.insert(treasuryReconciliationAudit).values({ statementTransactionId: transactionId, bankAccountId: transaction.bankAccountId, movementType: item.movementType, movementId: item.movementId, action: "settle", amount, previousAmount, resultingAmount, previousStatus: current.status, resultingStatus, paymentDate: transaction.transactionDate, performedBy: auth.email }),
          );
          let billingState = billingTotals.get(current.billingId);
          if (!billingState) {
            const [billing] = await db.select().from(billings).where(eq(billings.id, current.billingId)).limit(1);
            if (billing) {
              const siblings = await db.select().from(receivables).where(eq(receivables.billingId, current.billingId));
              billingState = { billing, totalAfter: siblings.reduce((sum, sibling) => sum + Number(sibling.receivedAmount), 0) };
              billingTotals.set(current.billingId, billingState);
            }
          }
          if (billingState) billingState.totalAfter += amount;
        } else if (item.movementType === "payable") {
          const [current] = await db.select().from(payables).where(eq(payables.id, item.movementId)).limit(1);
          if (!current || current.status === "cancelado") return Response.json({ error: "Uma das contas a pagar do rateio não está disponível para baixa." }, { status: 409 });
          const target = Math.max(0, Number(current.amount));
          const previousAmount = Math.max(0, Number(current.paidAmount));
          const remaining = Math.max(0, target - previousAmount);
          if (amount > remaining + 0.01) return Response.json({ error: `O rateio de ${amount.toFixed(2)} ultrapassa o saldo atual da conta a pagar.` }, { status: 409 });
          const resultingAmount = Math.min(target, previousAmount + amount);
          const resultingStatus = resultingAmount <= 0 ? "aberto" : resultingAmount < target - 0.01 ? "parcial" : "pago";
          queries.push(
            db.update(payables).set({ paidAmount: resultingAmount, paymentDate: transaction.transactionDate, status: resultingStatus, updatedAt: now }).where(eq(payables.id, current.id)),
            db.insert(treasuryReconciliationSettlements).values({ statementTransactionId: transactionId, bankAccountId: transaction.bankAccountId, movementType: item.movementType, movementId: item.movementId, settlementAmount: amount, previousAmount, resultingAmount, previousStatus: current.status, resultingStatus, previousPaymentDate: current.paymentDate, paymentDate: transaction.transactionDate, settledBy: auth.email }),
            db.insert(treasuryReconciliationAudit).values({ statementTransactionId: transactionId, bankAccountId: transaction.bankAccountId, movementType: item.movementType, movementId: item.movementId, action: "settle", amount, previousAmount, resultingAmount, previousStatus: current.status, resultingStatus, paymentDate: transaction.transactionDate, performedBy: auth.email }),
          );
        }
      }
      for (const { billing, totalAfter } of billingTotals.values()) queries.push(db.update(billings).set({ receivedAmount: totalAfter, status: totalAfter <= 0 ? "pendente" : totalAfter < Number(billing.total) - 0.01 ? "parcial" : "recebido", updatedAt: now }).where(eq(billings.id, billing.id)));
      queries.push(db.update(treasuryStatementTransactions).set({ matchMethod: "split-settle", updatedAt: now }).where(eq(treasuryStatementTransactions.id, transactionId)));
      await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
      return Response.json({ settled: true, count: pending.length, amount: pending.reduce((sum, item) => sum + Number(item.allocatedAmount), 0) });
    }

    return Response.json({ error: "Ação de rateio inválida." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error && /UNIQUE/i.test(error.message) ? "O rateio mudou enquanto você trabalhava. Atualize a tela e tente novamente." : "Não foi possível atualizar o rateio da conciliação.";
    return Response.json({ error: message }, { status: 500 });
  }
}
