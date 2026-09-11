import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { billings, companies, payables, receivables, sales, suppliers } from "@/db/schema";
import { treasuryMovementAccounts } from "@/db/treasury-schema";
import { ensureTreasuryTables, requireTreasuryAccess } from "@/app/treasury-runtime";

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;

  try {
    await ensureTreasuryTables();
    const db = getDb();
    const [billingRows, receivableRows, payableRows, allocations] = await Promise.all([
      db
        .select({
          id: billings.id,
          number: billings.number,
          total: billings.total,
          receivedAmount: billings.receivedAmount,
          dueDate: billings.dueDate,
          status: billings.status,
          createdAt: billings.createdAt,
          companyName: sales.companyName,
          saleNumber: sales.number,
        })
        .from(billings)
        .innerJoin(sales, eq(billings.saleId, sales.id)),
      db
        .select({
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
          createdAt: receivables.createdAt,
          updatedAt: receivables.updatedAt,
          billingNumber: billings.number,
          companyName: sales.companyName,
          saleNumber: sales.number,
        })
        .from(receivables)
        .innerJoin(billings, eq(receivables.billingId, billings.id))
        .innerJoin(sales, eq(billings.saleId, sales.id)),
      db
        .select({
          id: payables.id,
          supplierName: suppliers.name,
          companyName: companies.name,
          project: payables.project,
          groupNumber: payables.groupNumber,
          reference: payables.reference,
          description: payables.description,
          category: payables.category,
          installmentNumber: payables.installmentNumber,
          installmentCount: payables.installmentCount,
          amount: payables.amount,
          dueDate: payables.dueDate,
          paidAmount: payables.paidAmount,
          paymentDate: payables.paymentDate,
          status: payables.status,
          createdAt: payables.createdAt,
          updatedAt: payables.updatedAt,
        })
        .from(payables)
        .innerJoin(suppliers, eq(payables.supplierId, suppliers.id))
        .leftJoin(companies, eq(payables.companyId, companies.id)),
      db.select().from(treasuryMovementAccounts),
    ]);

    const allocationByMovement = new Map(
      allocations.map((item) => [`${item.movementType}:${item.movementId}`, item.bankAccountId]),
    );
    const bankAccountFor = (movementType: string, movementId: number, billingId?: number) => {
      const direct = allocationByMovement.get(`${movementType}:${movementId}`);
      if (direct) return { bankAccountId: direct, allocationSource: "direct" as const };
      if (movementType === "receivable" && billingId) {
        const inherited = allocationByMovement.get(`billing:${billingId}`);
        if (inherited) return { bankAccountId: inherited, allocationSource: "billing" as const };
      }
      return { bankAccountId: null, allocationSource: null };
    };

    const billingIdsWithInstallments = new Set(receivableRows.map((row) => row.billingId));

    const inflows = receivableRows.map((row) => {
      const grossAmount = Math.max(0, Number(row.amount) + Number(row.interest) + Number(row.penalty) - Number(row.discount));
      const realizedAmount = Math.max(0, Number(row.receivedAmount));
      return {
        id: `receivable-${row.id}`,
        movementId: row.id,
        type: "inflow" as const,
        source: "receivable" as const,
        document: row.billingNumber,
        counterpart: row.companyName,
        detail: `Parcela ${row.installmentNumber} · ${row.saleNumber}`,
        dueDate: row.dueDate,
        scheduledAmount: Math.max(0, grossAmount - realizedAmount),
        realizedAmount,
        paymentDate: row.paymentDate,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ...bankAccountFor("receivable", row.id, row.billingId),
      };
    });

    const billingFallbacks = billingRows
      .filter((row) => !billingIdsWithInstallments.has(row.id))
      .map((row) => ({
        id: `billing-${row.id}`,
        movementId: row.id,
        type: "inflow" as const,
        source: "billing" as const,
        document: row.number,
        counterpart: row.companyName,
        detail: `${row.saleNumber} · faturamento sem parcelas geradas`,
        dueDate: row.dueDate,
        scheduledAmount: Math.max(0, Number(row.total) - Number(row.receivedAmount)),
        realizedAmount: Math.max(0, Number(row.receivedAmount)),
        paymentDate: null as string | null,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
        ...bankAccountFor("billing", row.id),
      }));

    const outflows = payableRows
      .filter((row) => row.status !== "cancelado")
      .map((row) => ({
        id: `payable-${row.id}`,
        movementId: row.id,
        type: "outflow" as const,
        source: "payable" as const,
        document: row.groupNumber,
        counterpart: row.supplierName,
        detail: `${row.description}${row.companyName ? ` · ${row.companyName}` : row.project ? ` · ${row.project}` : ""}${row.installmentCount > 1 ? ` · Parcela ${row.installmentNumber}/${row.installmentCount}` : ""}`,
        dueDate: row.dueDate,
        scheduledAmount: Math.max(0, Number(row.amount) - Number(row.paidAmount)),
        realizedAmount: Math.max(0, Number(row.paidAmount)),
        paymentDate: row.paymentDate,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        ...bankAccountFor("payable", row.id),
      }));

    const movements = [...inflows, ...billingFallbacks, ...outflows];
    return Response.json({
      movements,
      dataQuality: {
        billingsWithoutInstallments: billingFallbacks.length,
        billingsWithoutDueDate: billingFallbacks.filter((item) => item.scheduledAmount > 0 && !item.dueDate).length,
        receivedWithoutPaymentDate: [...inflows, ...billingFallbacks].filter((item) => item.realizedAmount > 0 && !item.paymentDate).length,
        paidWithoutPaymentDate: outflows.filter((item) => item.realizedAmount > 0 && !item.paymentDate).length,
        movementsWithoutBankAccount: movements.filter((item) => item.scheduledAmount > 0 && !item.bankAccountId).length,
      },
    });
  } catch {
    return Response.json({ error: "Não foi possível calcular o fluxo de caixa líquido." }, { status: 503 });
  }
}
