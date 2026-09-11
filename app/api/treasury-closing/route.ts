import { lte } from "drizzle-orm";
import { ensureFinancialLedger, isDateKey, todaySaoPaulo } from "@/app/financial-ledger";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import {
  treasuryBankAccounts,
  treasuryFinancialEvents,
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
    const [accounts, transactions, allocations, events, imports] = await Promise.all([
      db.select().from(treasuryBankAccounts),
      db.select().from(treasuryStatementTransactions).where(lte(treasuryStatementTransactions.transactionDate, requestedDate)),
      db.select().from(treasuryReconciliationAllocations),
      db.select().from(treasuryFinancialEvents).where(lte(treasuryFinancialEvents.eventDate, requestedDate)),
      db.select().from(treasuryStatementImports),
    ]);

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
      const accountEvents = events
        .filter((event) => event.bankAccountId === account.id)
        .filter((event) => event.eventDate > account.balanceDate && event.eventDate <= requestedDate);
      const ledgerNet = round2(accountEvents.reduce((sum, event) => sum + signedLedgerAmount(event), 0));
      const bookBalance = round2(Number(account.currentBalance) + (anchorValid ? ledgerNet : 0));

      const accountTransactions = transactions
        .filter((transaction) => transaction.bankAccountId === account.id)
        .filter((transaction) => transaction.transactionDate > account.balanceDate && transaction.transactionDate <= requestedDate)
        .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.id - b.id);
      const statementNet = round2(accountTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0));

      const closingTransactions = transactions
        .filter((transaction) => transaction.bankAccountId === account.id && transaction.transactionDate <= requestedDate)
        .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.id - a.id);
      const balanceTransaction = closingTransactions.find((transaction) => transaction.balance !== null && Number.isFinite(Number(transaction.balance))) ?? null;
      const statementBalance = balanceTransaction ? round2(Number(balanceTransaction.balance)) : null;
      const laterThanBalance = balanceTransaction
        ? closingTransactions.filter((transaction) => transaction.transactionDate > balanceTransaction.transactionDate)
        : closingTransactions;
      const statementBalanceCurrent = Boolean(balanceTransaction && laterThanBalance.length === 0);

      let unallocatedAmount = 0;
      let unallocatedCount = 0;
      let fullyAllocatedCount = 0;
      for (const transaction of accountTransactions) {
        const statementAmount = Math.abs(Number(transaction.amount));
        const allocatedAmount = allocationByTransaction.get(transaction.id) ?? 0;
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

      const unknownEvents = events.filter((event) =>
        event.bankAccountId === null &&
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
      if (statementBalance === null) issues.push("O extrato não possui saldo bancário utilizável.");
      else if (!statementBalanceCurrent) issues.push("Há lançamentos posteriores ao último saldo informado pelo extrato.");
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
        statementBalanceDate: balanceTransaction?.transactionDate ?? null,
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
    const unknownEventIds = new Set<number>();
    let unknownLedgerAmount = 0;
    for (const event of events.filter((item) => item.bankAccountId === null && item.eventDate <= requestedDate)) {
      if (unknownEventIds.has(event.id)) continue;
      unknownEventIds.add(event.id);
      unknownLedgerAmount += Math.abs(Number(event.amount));
    }

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
        unknownLedgerEventCount: unknownEventIds.size,
        unknownLedgerAmount: round2(unknownLedgerAmount),
      },
    });
  } catch {
    return Response.json({ error: "Não foi possível conferir o fechamento da tesouraria." }, { status: 503 });
  }
}
