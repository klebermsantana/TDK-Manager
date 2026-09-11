import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { ensureFinancialLedger, isDateKey, ledgerSourceKey, todaySaoPaulo } from "@/app/financial-ledger";
import { movementClosedPeriodResponse } from "@/app/treasury-closing-lock";
import { getDb } from "@/db";
import { companies, payables, suppliers } from "@/db/schema";
import { treasuryFinancialEvents, treasuryMovementAccounts } from "@/db/treasury-schema";

const addMonths = (date: string, months: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
};

export async function GET() {
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const rows = await getDb().select({
      id: payables.id,
      supplierId: payables.supplierId,
      supplierName: suppliers.name,
      companyId: payables.companyId,
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
    }).from(payables)
      .innerJoin(suppliers, eq(payables.supplierId, suppliers.id))
      .leftJoin(companies, eq(payables.companyId, companies.id))
      .orderBy(asc(payables.dueDate));
    const supplierRows = await getDb().select().from(suppliers).orderBy(asc(suppliers.name));
    return Response.json({ payables: rows, suppliers: supplierRows });
  } catch {
    return Response.json({ error: "Não foi possível carregar as contas a pagar." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requirePermission("payables");
  if (denied) return denied;
  if (!await getChatGPTUser()) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const p = await request.json() as Record<string, unknown>;
    const supplierName = String(p.supplierName ?? "").trim();
    const description = String(p.description ?? "").trim();
    const total = Number(p.amount);
    const count = Math.max(1, Math.min(120, Number(p.installments) || 1));
    const dueDate = String(p.dueDate ?? "");
    const companyId = Number(p.companyId) || null;
    if (!supplierName || !description || !Number.isFinite(total) || total <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return Response.json({ error: "Preencha fornecedor, descrição, valor e primeiro vencimento." }, { status: 400 });
    }
    const db = getDb();
    let [supplier] = await db.select().from(suppliers).where(eq(suppliers.name, supplierName)).limit(1);
    if (!supplier) [supplier] = await db.insert(suppliers).values({
      name: supplierName,
      document: String(p.supplierDocument ?? "").trim() || null,
      email: String(p.supplierEmail ?? "").trim() || null,
      phone: String(p.supplierPhone ?? "").trim() || null,
    }).returning();
    const [company] = companyId ? await db.select().from(companies).where(eq(companies.id, companyId)).limit(1) : [];
    const groupNumber = `PAG-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const base = Math.floor(total * 100 / count);
    const remainder = Math.round(total * 100) - base * count;
    const created = await db.insert(payables).values(Array.from({ length: count }, (_, index) => ({
      supplierId: supplier.id,
      companyId: company?.id ?? null,
      project: String(p.project ?? "").trim() || null,
      groupNumber,
      reference: String(p.reference ?? "").trim() || null,
      description,
      category: String(p.category ?? "outros"),
      installmentNumber: index + 1,
      installmentCount: count,
      amount: (base + (index === count - 1 ? remainder : 0)) / 100,
      dueDate: addMonths(dueDate, index),
    }))).returning();
    return Response.json({ payables: created.map((item) => ({ ...item, supplierName: supplier.name, companyName: company?.name ?? null })), supplier }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível cadastrar a conta a pagar." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requirePermission("payables");
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureFinancialLedger();
    const p = await request.json() as Record<string, unknown>;
    const id = Number(p.id);
    const action = String(p.action ?? "");
    const db = getDb();
    const [current] = await db.select().from(payables).where(eq(payables.id, id)).limit(1);
    if (!current) return Response.json({ error: "Conta não encontrada." }, { status: 404 });

    if (action === "cancel") {
      if (current.paidAmount > 0) return Response.json({ error: "Estorne o pagamento antes de cancelar a conta." }, { status: 400 });
      const [payable] = await db.update(payables).set({ status: "cancelado", updatedAt: new Date().toISOString() }).where(eq(payables.id, id)).returning();
      return Response.json({ payable });
    }
    if (action === "reopen") {
      const [payable] = await db.update(payables).set({ status: "aberto", updatedAt: new Date().toISOString() }).where(eq(payables.id, id)).returning();
      return Response.json({ payable });
    }

    const amount = Math.max(0.01, Number(p.amount) || Number(current.amount));
    const paidAmount = Math.min(amount, Math.max(0, Number(p.paidAmount) || 0));
    const status = paidAmount <= 0 ? "aberto" : paidAmount < amount - 0.01 ? "parcial" : "pago";
    const delta = Number((paidAmount - Number(current.paidAmount)).toFixed(2));
    const explicitDate = isDateKey(p.paymentDate) ? String(p.paymentDate) : null;
    const eventDate = explicitDate ?? todaySaoPaulo();
    const paymentDate = paidAmount <= 0
      ? null
      : explicitDate ?? (delta > 0.009 ? eventDate : current.paymentDate ?? eventDate);
    const now = new Date().toISOString();

    if (Math.abs(delta) > 0.009) {
      const locked = await movementClosedPeriodResponse("payable", current.id, eventDate, delta > 0 ? "registrar este pagamento" : "estornar ou ajustar este pagamento");
      if (locked) return locked;
    }

    const movementAccounts = await db.select().from(treasuryMovementAccounts);
    const bankAccountId = movementAccounts.find((item) => item.movementType === "payable" && item.movementId === current.id)?.bankAccountId ?? null;

    const queries: any[] = [
      db.update(payables).set({
        reference: String(p.reference ?? "").trim() || null,
        description: String(p.description ?? current.description).trim(),
        category: String(p.category ?? current.category),
        amount,
        dueDate: String(p.dueDate ?? current.dueDate),
        paidAmount,
        paymentDate,
        status,
        updatedAt: now,
      }).where(eq(payables.id, id)),
    ];

    if (Math.abs(delta) > 0.009) {
      queries.push(db.insert(treasuryFinancialEvents).values({
        movementType: "payable",
        movementId: current.id,
        direction: "outflow",
        eventType: delta > 0 ? "payment" : "adjustment",
        amount: delta,
        eventDate,
        source: "manual",
        sourceKey: ledgerSourceKey(`manual:payable:${current.id}`),
        bankAccountId,
        performedBy: auth.email,
        notes: delta > 0 ? "Pagamento lançado manualmente" : "Estorno ou ajuste manual de pagamento",
      }));
    }

    await db.batch(queries as [typeof queries[number], ...typeof queries[number][]]);
    const [payable] = await db.select().from(payables).where(eq(payables.id, id)).limit(1);
    return Response.json({ payable });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a conta a pagar." }, { status: 500 });
  }
}
