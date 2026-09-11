import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { ensureFinancialLedger, isDateKey, ledgerSourceKey, todaySaoPaulo } from "@/app/financial-ledger";
import { getDb } from "@/db";
import { billings, receivables, sales } from "@/db/schema";
import { treasuryFinancialEvents, treasuryMovementAccounts } from "@/db/treasury-schema";

const addMonths = (value: string, months: number) => {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const rows = await getDb().select({
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
    }).from(receivables)
      .innerJoin(billings, eq(receivables.billingId, billings.id))
      .innerJoin(sales, eq(billings.saleId, sales.id))
      .orderBy(asc(receivables.dueDate));
    return Response.json({ receivables: rows });
  } catch {
    return Response.json({ error: "Não foi possível carregar as contas a receber." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requirePermission("receivables");
  if (denied) return denied;
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const billingId = Number((await request.json()).billingId);
    const db = getDb();
    const [billing] = await db.select().from(billings).where(eq(billings.id, billingId)).limit(1);
    if (!billing || !billing.dueDate) return Response.json({ error: "Informe o primeiro vencimento no faturamento." }, { status: 400 });
    const existing = await db.select().from(receivables).where(eq(receivables.billingId, billingId));
    if (existing.some((item) => item.receivedAmount > 0)) return Response.json({ error: "Não é possível recriar parcelas que já possuem recebimentos." }, { status: 409 });
    if (existing.length) await db.delete(receivables).where(eq(receivables.billingId, billingId));
    const count = Math.max(1, billing.installments);
    const base = Math.floor(billing.total * 100 / count) / 100;
    const created = await db.insert(receivables).values(Array.from({ length: count }, (_, index) => ({
      billingId,
      installmentNumber: index + 1,
      amount: index === count - 1 ? Number((billing.total - base * (count - 1)).toFixed(2)) : base,
      dueDate: addMonths(billing.dueDate!, index),
    }))).returning();
    return Response.json({ receivables: created }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível gerar as parcelas." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requirePermission("receivables");
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureFinancialLedger();
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    const db = getDb();
    const [current] = await db.select().from(receivables).where(eq(receivables.id, id)).limit(1);
    if (!current) return Response.json({ error: "Parcela não encontrada." }, { status: 404 });

    const amount = Number.isFinite(Number(payload.amount)) ? Number(payload.amount) : Number(current.amount);
    const receivedAmount = Math.max(0, Number(payload.receivedAmount) || 0);
    const interest = Math.max(0, Number(payload.interest) || 0);
    const penalty = Math.max(0, Number(payload.penalty) || 0);
    const discount = Math.max(0, Number(payload.discount) || 0);
    const target = Math.max(0, amount + interest + penalty - discount);
    const status = receivedAmount <= 0 ? "aberto" : receivedAmount < target - 0.01 ? "parcial" : "recebido";
    const delta = Number((receivedAmount - Number(current.receivedAmount)).toFixed(2));
    const explicitDate = isDateKey(payload.paymentDate) ? String(payload.paymentDate) : null;
    const eventDate = explicitDate ?? todaySaoPaulo();
    const paymentDate = receivedAmount <= 0
      ? null
      : explicitDate ?? (delta > 0.009 ? eventDate : current.paymentDate ?? eventDate);
    const now = new Date().toISOString();

    const siblings = await db.select().from(receivables).where(eq(receivables.billingId, current.billingId));
    const totalReceived = siblings.reduce((sum, item) => sum + (item.id === current.id ? receivedAmount : Number(item.receivedAmount)), 0);
    const [billing] = await db.select().from(billings).where(eq(billings.id, current.billingId)).limit(1);
    const movementAccounts = await db.select().from(treasuryMovementAccounts);
    const bankAccountId = movementAccounts.find((item) => item.movementType === "receivable" && item.movementId === current.id)?.bankAccountId
      ?? movementAccounts.find((item) => item.movementType === "billing" && item.movementId === current.billingId)?.bankAccountId
      ?? null;

    const queries: any[] = [
      db.update(receivables).set({
        receivedAmount,
        interest,
        penalty,
        discount,
        paymentDate,
        status,
        updatedAt: now,
      }).where(eq(receivables.id, id)),
    ];

    if (Math.abs(delta) > 0.009) {
      queries.push(db.insert(treasuryFinancialEvents).values({
        movementType: "receivable",
        movementId: current.id,
        direction: "inflow",
        eventType: delta > 0 ? "payment" : "adjustment",
        amount: delta,
        eventDate,
        source: "manual",
        sourceKey: ledgerSourceKey(`manual:receivable:${current.id}`),
        bankAccountId,
        performedBy: auth.email,
        notes: delta > 0 ? "Recebimento lançado manualmente" : "Estorno ou ajuste manual de recebimento",
      }));
    }

    if (billing) {
      queries.push(db.update(billings).set({
        receivedAmount: totalReceived,
        status: totalReceived <= 0 ? "pendente" : totalReceived < Number(billing.total) - 0.01 ? "parcial" : "recebido",
        updatedAt: now,
      }).where(eq(billings.id, billing.id)));
    }

    await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
    const [updated] = await db.select().from(receivables).where(eq(receivables.id, id)).limit(1);
    return Response.json({ receivable: updated, totalReceived });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a parcela." }, { status: 500 });
  }
}
