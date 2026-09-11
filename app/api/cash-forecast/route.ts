import { eq } from "drizzle-orm";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { billings, receivables, sales } from "@/db/schema";

export async function GET() {
  const denied = await requirePermission("receivables");
  if (denied) return denied;

  try {
    const db = getDb();
    const [billingRows, receivableRows] = await Promise.all([
      db
        .select({
          id: billings.id,
          number: billings.number,
          saleId: billings.saleId,
          status: billings.status,
          dueDate: billings.dueDate,
          total: billings.total,
          receivedAmount: billings.receivedAmount,
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
    ]);

    const billingIdsWithInstallments = new Set(receivableRows.map((row) => row.billingId));

    const installmentEntries = receivableRows.map((row) => {
      const grossAmount = Math.max(0, Number(row.amount) + Number(row.interest) + Number(row.penalty) - Number(row.discount));
      const receivedAmount = Math.max(0, Number(row.receivedAmount));
      return {
        id: `receivable-${row.id}`,
        billingId: row.billingId,
        billingNumber: row.billingNumber,
        saleNumber: row.saleNumber,
        companyName: row.companyName,
        installmentNumber: row.installmentNumber,
        dueDate: row.dueDate,
        grossAmount,
        receivedAmount,
        openAmount: Math.max(0, grossAmount - receivedAmount),
        paymentDate: row.paymentDate,
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        source: "receivable" as const,
      };
    });

    const fallbackEntries = billingRows
      .filter((row) => !billingIdsWithInstallments.has(row.id))
      .map((row) => {
        const grossAmount = Math.max(0, Number(row.total));
        const receivedAmount = Math.max(0, Number(row.receivedAmount));
        return {
          id: `billing-${row.id}`,
          billingId: row.id,
          billingNumber: row.number,
          saleNumber: row.saleNumber,
          companyName: row.companyName,
          installmentNumber: null,
          dueDate: row.dueDate,
          grossAmount,
          receivedAmount,
          openAmount: Math.max(0, grossAmount - receivedAmount),
          paymentDate: null,
          status: row.status,
          createdAt: row.createdAt,
          updatedAt: row.createdAt,
          source: "billing" as const,
        };
      });

    const entries = [...installmentEntries, ...fallbackEntries].sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return a.billingNumber.localeCompare(b.billingNumber);
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

    return Response.json({
      entries,
      dataQuality: {
        billingsWithoutInstallments: fallbackEntries.length,
        billingsWithoutDueDate: fallbackEntries.filter((item) => !item.dueDate && item.openAmount > 0).length,
        receivedWithoutPaymentDate: installmentEntries.filter((item) => item.receivedAmount > 0 && !item.paymentDate).length,
      },
    });
  } catch {
    return Response.json({ error: "Não foi possível calcular o forecast de recebimentos." }, { status: 503 });
  }
}
