import { lte } from "drizzle-orm";
import { ensureFinancialLedger, isDateKey, todaySaoPaulo } from "@/app/financial-ledger";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { receivables } from "@/db/schema";
import {
  treasuryBankAccounts,
  treasuryFinancialEvents,
  treasuryMovementAccounts,
  treasuryReconciliationAllocations,
  treasuryStatementImports,
  treasuryStatementTransactions,
} from "@/db/treasury-schema";

const centsZero = (value: number) => Math.abs(value) <= 0.01;
const round2 = (value: number) => Number(value.toFixed(2));
const signedLedgerAmount = (event: typeof treasuryFinancialEvents.$inferSelect) => {
  const amount = Number(event.amount);
  return event.direction === "outflow" ? -amount : amount;
};

export async function GET(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;

  try {
    await ensureTreasuryTables();
    await ensureFinancialLedger();

    const requestedDate = new URL(request.url).searchParams.get("date") ?? todaySaoPaulo();
    if (!isDateKey(requestedDate)) return Response.json({ error: "Data de fechamento inválida." }, { status: 400 });

    const db = getDb();
    const [accounts, transactions, allocations, events, imports, movementAccounts, receivableRows] = await Promise.all([
      db.select().from(treasuryBankAccounts),
      db.select().from(treasuryStatementTransactions).where(lte(treasuryStatementTransactions.transactionDate, requestedDate)),
      db.select().from(treasuryReconciliationAllocations),
      db.select().from(treasuryFinancialEvents).where(lte(treasuryFinancialEvents.eventDate, requestedDate)),
      db.select().from(treasuryStatementImports),
      db.select().from(treasuryMovementAccounts),
      db.select({ id: receivables.id, billingId: receivables.billingId }).from(receivables),
    ]);

    const movementAccountMap = new Map(movementAccounts.map((item) => [`${item.movementType}:${item.movementId}`, item.bankAccountId]));
    const receivableBillingMap = new Map(receivableRows.map((item) => [item.id, item.billingId]));
    const resolveEventAccount = (event: typeof treasuryFinancialEvents.$inferSelect) => {
      if (event.bankAccountId) return event.bankAccountId;
      const direct = movementAccountMap.get(`${event.movementType}:${event.movementId}`);
      if (direct) return direct;
      if (event.movementType === "receivable") {
        const billingId = receivableBillingMap.get(event.movementId);
        if (billingId) return movementAccountMap.get(`billing:${billingId}`) ?? null;
      }
      return null;
    };
    const resolvedEvents = events.map((event) => ({ ...event, resolvedBankAccountId: resolveEventAccount(event) }));

    const allocationByTransaction = new Map<number, number>();
    for (const allocation of allocations) {
      allocationByTransaction.set(
        allocation.statementTransactionId,
        (allocationByTransaction.get(allocation.statementTransactionId) ?? 0) + Math.abs(Number(allocation.allocatedAmount)),
      );
    }

    const activeAccounts = accounts.filter((account) => account.active);
    const rows = activeAccounts.map((account) => {
      const anchorValid = requestedDate >= account.balanceDate;
      const accountEvents = resolvedEvents
        .filter((event) => event.resolvedBankAccountId === account.id)
        .filter((event) => event.eventDate > account.balanceDate && event.eventDate <= requestedDate);
      const ledgerNet = round2(accountEvents.reduce((sum, event) => sum + signedLedgerAmount(event), 0));
      const bookBalance = round2(Number(account.currentBalance) + (anchorValid ? ledgerNet : 0));

      const accountTransactions = transactions
        .filter((transaction) => transaction.bankAccountId === account.id)
        .filter((transaction) => transaction.transactionDate > account.balanceDate && transaction.transactionDate <= requestedDate)
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id - b.id);
      const statementNet = round2(accountTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0));

      let unallocatedAmount = 0;
      let unallocatedCount = 0;
      let fullyAllocatedCount = 0;
      for (const transaction of accountTransactions) {
        const statementAmount = Math.abs(Number(transaction.amount));
        const splitAllocatedAmount = allocationByTransaction.get(transaction.id) ?? 0;
        const legacyFullyMatched = Boolean(transaction.matchedMovementType && transaction.matchedMovementId);
        const allocatedAmount = splitAllocatedAmount > 0.009
          ? splitAllocatedAmount
          : legacyFullyMatched ? statementAmount : 0;
        const remaining = Math.max(0, statementAmount - allocatedAmount);
        if (remaining > 0.01) {
          unallocatedAmount += remaining;
          unallocatedCount += 1;
        } else {
          fullyAllocatedCount += 1;
        }
      }
      unallocatedAmount = round2(unallocatedAmount);
      const reconciliationCoverage = accountTransactions.length
        ? fullyAllocatedCount / accountTransactions.length * 100
        : 100;

      const latestImport = imports
        .filter((item) => item.bankAccountId === account.id)
        .sort((a, b) => (b.periodEnd ?? "").localeCompare(a.periodEnd ?? "") || b.id - a.id)[0] ?? null;
      const statementCovered = Boolean(latestImport?.periodEnd && latestImport.periodEnd >= requestedDate);

      const closingTransactions = transactions
        .filter((transaction) => transaction.bankAccountId === account.id && transaction.transactionDate <= requestedDate)
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.id - a.id);
      const balanceTransaction = closingTransactions.find((transaction) => transaction.balance !== null && Number.isFinite(Number(transaction.balance))) ?? null;
      const laterThanExplicitBalance = balanceTransaction
        ? closingTransactions.filter((transaction) => transaction.transactionDate > balanceTransaction.transactionDate)
        : closingTransactions;
      const explicitBalanceCurrent = Boolean(balanceTransaction && laterThanExplicitBalance.length === 0);
      const explicitStatementBalance = explicitBalanceCurrent ? round2(Number(balanceTransaction!.balance)) : null;
      const movementStatementBalance = anchorValid && statementCovered
        ? round2(Number(account.currentBalance) + statementNet)
        : null;
      const statementBalance = explicitStatementBalance ?? movementStatementBalance;
      const statementBalanceSource = explicitStatementBalance !== null ? "statement" as const : movementStatementBalance !== null ? "movement" as const : null;
      const statementBalanceDate = explicitStatementBalance !== null
        ? balanceTransaction?.transactionDate ?? null
        : movementStatementBalance !== null ? requestedDate : balanceTransaction?.transactionDate ?? null;
      const statementBalanceCurrent = statementBalance !== null && statementCovered;

      const unknownEvents = resolvedEvents.filter((event) =>
        event.resolvedBankAccountId === null &&
        event.eventDate > account.balanceDate &&
        event.eventDate <= requestedDate,
      );
      const unknownLedgerAmount = round2(unknownEvents.reduce((sum, event) => sum + Math.abs(Number(event.amount)), 0));

      const movementDifference = round2(statementNet - ledgerNet);
      const closingDifference = statementBalance === null ? null : round2(statementBalance - bookBalance);
      const issues: string[] = [];
      if (!anchorValid) issues.push("A data de corte é anterior ao saldo-base informado da conta.");
      if (!latestImport) issues.push("Nenhum extrato foi importado para esta conta.");
      else if (!statementCovered) issues.push(`O último extrato cobre somente até ${latestImport.periodEnd ?? "data não informada"}.`);
      if (statementBalance === null) issues.push("Não há extrato suficiente para calcular o saldo bancário na data de corte.");
      if (balanceTransaction && !explicitBalanceCurrent && statementBalanceSource === "movement") issues.push("O saldo explícito do arquivo é anterior aos últimos lançamentos; a conferência usa a movimentação do extrato desde o saldo-base.");
      if (closingDifference !== null && !centsZero(closingDifference)) issues.push(`Diferença de fechamento de ${closingDifference.toFixed(2)} entre extrato e TDK.`);
      if (unallocatedAmount > 0.01) issues.push(`${unallocatedCount} lançamento(s) do extrato ainda possuem valor sem conciliação.`);
      if (unknownEvents.length) issues.push(`${unknownEvents.length} evento(s) do razão no período ainda não têm conta bancária definida.`);

      const ready = anchorValid && statementCovered && statementBalance !== null && statementBalanceCurrent &&
        centsZero(closingDifference ?? 0) && unallocatedAmount <= 0.01 && unknownEvents.length === 0;

      return {
        accountId: account.id,
        accountName: account.name,
        bankName: account.bankName,
        balanceDate: account.balanceDate,
        baseBalance: Number(account.currentBalance),
        ledgerNet,
        ledgerEventCount: accountEvents.length,
        bookBalance,
        statementNet,
        statementTransactionCount: accountTransactions.length,
        statementBalance,
        statementBalanceSource,
        statementBalanceDate,
        statementBalanceCurrent,
        latestImportPeriodEnd: latestImport?.periodEnd ?? null,
        statementCovered,
        movementDifference,
        closingDifference,
        reconciliationCoverage,
        fullyAllocatedCount,
        unallocatedCount,
        unallocatedAmount,
        unknownLedgerEventCount: unknownEvents.length,
        unknownLedgerAmount,
        ready,
        issues,
      };
    });

    const comparable = rows.filter((row) => row.closingDifference !== null && row.statementBalanceCurrent);
    const earliestAnchor = activeAccounts.length
      ? activeAccounts.reduce((min, account) => account.balanceDate < min ? account.balanceDate : min, activeAccounts[0].balanceDate)
      : requestedDate;
    const unresolvedEvents = resolvedEvents.filter((event) =>
      event.resolvedBankAccountId === null && event.eventDate > earliestAnchor && event.eventDate <= requestedDate,
    );

    return Response.json({
      date: requestedDate,
      accounts: rows,
      summary: {
        activeAccounts: rows.length,
        readyAccounts: rows.filter((row) => row.ready).length,
        bookBalance: round2(rows.reduce((sum, row) => sum + row.bookBalance, 0)),
        statementBalance: round2(comparable.reduce((sum, row) => sum + Number(row.statementBalance ?? 0), 0)),
        comparableAccounts: comparable.length,
        closingDifference: round2(comparable.reduce((sum, row) => sum + Number(row.closingDifference ?? 0), 0)),
        unallocatedStatementAmount: round2(rows.reduce((sum, row) => sum + row.unallocatedAmount, 0)),
        unallocatedStatementCount: rows.reduce((sum, row) => sum + row.unallocatedCount, 0),
        unknownLedgerEventCount: unresolvedEvents.length,
        unknownLedgerAmount: round2(unresolvedEvents.reduce((sum, event) => sum + Math.abs(Number(event.amount)), 0)),
      },
    });
  } catch {
    return Response.json({ error: "Não foi possível conferir o fechamento da tesouraria." }, { status: 503 });
  }
}
