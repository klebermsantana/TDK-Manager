import { desc, eq } from "drizzle-orm";
import { ensureFinancialLedger } from "@/app/financial-ledger";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { billings, payables, receivables, sales, suppliers } from "@/db/schema";
import { treasuryBankAccounts, treasuryFinancialEvents, treasuryStatementTransactions } from "@/db/treasury-schema";

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;

  try {
    await ensureTreasuryTables();
    await ensureFinancialLedger();
    const db = getDb();
    const [events, receivableRows, payableRows, billingRows, accounts, statements] = await Promise.all([
      db.select().from(treasuryFinancialEvents).orderBy(desc(treasuryFinancialEvents.eventDate), desc(treasuryFinancialEvents.id)).limit(2500),
      db.select({
        id: receivables.id,
        billingNumber: billings.number,
        installmentNumber: receivables.installmentNumber,
        companyName: sales.companyName,
        saleNumber: sales.number,
      }).from(receivables)
        .innerJoin(billings, eq(receivables.billingId, billings.id))
        .innerJoin(sales, eq(billings.saleId, sales.id)),
      db.select({
        id: payables.id,
        groupNumber: payables.groupNumber,
        installmentNumber: payables.installmentNumber,
        installmentCount: payables.installmentCount,
        description: payables.description,
        supplierName: suppliers.name,
      }).from(payables).innerJoin(suppliers, eq(payables.supplierId, suppliers.id)),
      db.select({
        id: billings.id,
        number: billings.number,
        companyName: sales.companyName,
        saleNumber: sales.number,
      }).from(billings).innerJoin(sales, eq(billings.saleId, sales.id)),
      db.select().from(treasuryBankAccounts),
      db.select({
        id: treasuryStatementTransactions.id,
        description: treasuryStatementTransactions.description,
        document: treasuryStatementTransactions.document,
      }).from(treasuryStatementTransactions),
    ]);

    const receivableMap = new Map(receivableRows.map((item) => [item.id, item]));
    const payableMap = new Map(payableRows.map((item) => [item.id, item]));
    const billingMap = new Map(billingRows.map((item) => [item.id, item]));
    const accountMap = new Map(accounts.map((item) => [item.id, item]));
    const statementMap = new Map(statements.map((item) => [item.id, item]));

    const rows = events.map((event) => {
      let document = `#${event.movementId}`;
      let counterpart = "—";
      let detail = event.notes ?? "Movimento financeiro";
      if (event.movementType === "receivable") {
        const item = receivableMap.get(event.movementId);
        if (item) {
          document = item.billingNumber;
          counterpart = item.companyName;
          detail = `Parcela ${item.installmentNumber} · ${item.saleNumber}`;
        }
      } else if (event.movementType === "payable") {
        const item = payableMap.get(event.movementId);
        if (item) {
          document = item.groupNumber;
          counterpart = item.supplierName;
          detail = `${item.description}${item.installmentCount > 1 ? ` · Parcela ${item.installmentNumber}/${item.installmentCount}` : ""}`;
        }
      } else if (event.movementType === "billing") {
        const item = billingMap.get(event.movementId);
        if (item) {
          document = item.number;
          counterpart = item.companyName;
          detail = item.saleNumber;
        }
      }
      const account = event.bankAccountId ? accountMap.get(event.bankAccountId) : null;
      const statement = event.statementTransactionId ? statementMap.get(event.statementTransactionId) : null;
      return {
        id: event.id,
        movementType: event.movementType,
        movementId: event.movementId,
        direction: event.direction,
        eventType: event.eventType,
        amount: Number(event.amount),
        eventDate: event.eventDate,
        source: event.source,
        sourceKey: event.sourceKey,
        bankAccountId: event.bankAccountId,
        bankAccountName: account?.name ?? null,
        bankName: account?.bankName ?? null,
        statementTransactionId: event.statementTransactionId,
        bankDescription: statement?.description ?? statement?.document ?? null,
        performedBy: event.performedBy,
        notes: event.notes,
        document,
        counterpart,
        detail,
        createdAt: event.createdAt,
      };
    });

    return Response.json({
      events: rows,
      accounts: accounts.filter((item) => item.active).map((item) => ({ id: item.id, name: item.name, bankName: item.bankName })),
      summary: {
        totalEvents: rows.length,
        legacySnapshots: rows.filter((item) => item.eventType === "legacy_snapshot").length,
        reconciliationEvents: rows.filter((item) => item.source === "reconciliation").length,
        manualEvents: rows.filter((item) => item.source === "manual").length,
      },
    });
  } catch {
    return Response.json({ error: "Não foi possível carregar o razão financeiro." }, { status: 503 });
  }
}
