import { eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import {
  catalogItems,
  equipmentItems,
  sales,
  serviceCallEquipment,
  serviceCallExpenses,
  serviceCallMaterials,
  serviceCallServices,
  serviceCalls,
} from "@/db/schema";
import { serviceCallFinancials } from "@/db/profitability-schema";

async function ensureFinancialTable() {
  await getDb().run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_call_financials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_call_id INTEGER NOT NULL UNIQUE,
      revenue_amount REAL,
      notes TEXT,
      updated_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (service_call_id) REFERENCES service_calls(id)
    )
  `));
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export async function GET() {
  const denied = await requirePermission("service_profitability");
  if (denied) return denied;
  try {
    await ensureFinancialTable();
    const db = getDb();
    const [calls, materials, services, equipment, expenses, financials, catalog, equipmentCatalog, saleRows] = await Promise.all([
      db.select().from(serviceCalls),
      db.select().from(serviceCallMaterials),
      db.select().from(serviceCallServices),
      db.select().from(serviceCallEquipment),
      db.select().from(serviceCallExpenses),
      db.select().from(serviceCallFinancials),
      db.select().from(catalogItems),
      db.select().from(equipmentItems),
      db.select().from(sales),
    ]);

    const catalogById = new Map(catalog.map((item) => [item.id, item]));
    const equipmentById = new Map(equipmentCatalog.map((item) => [item.id, item]));
    const financialByCall = new Map(financials.map((item) => [item.serviceCallId, item]));
    const saleById = new Map(saleRows.map((item) => [item.id, item]));
    const callsPerSale = new Map<number, number>();
    calls.forEach((call) => {
      if (call.saleId) callsPerSale.set(call.saleId, (callsPerSale.get(call.saleId) ?? 0) + 1);
    });

    const rows = calls.map((call) => {
      const callMaterials = materials.filter((item) => item.serviceCallId === call.id);
      const callServices = services.filter((item) => item.serviceCallId === call.id);
      const callEquipment = equipment.filter((item) => item.serviceCallId === call.id);
      const callExpenses = expenses.filter((item) => item.serviceCallId === call.id);

      const materialCost = sum(callMaterials.map((item) => item.quantity * item.unitCost));
      const materialRevenue = sum(callMaterials.map((item) => item.quantity * item.unitPrice));
      const serviceCost = sum(callServices.map((item) => item.quantity * (catalogById.get(item.catalogId ?? -1)?.cost ?? 0)));
      const serviceRevenue = sum(callServices.map((item) => item.quantity * (catalogById.get(item.catalogId ?? -1)?.standardPrice ?? 0)));
      const equipmentCost = sum(callEquipment.map((item) => item.quantity * (equipmentById.get(item.equipmentItemId ?? -1)?.cost ?? 0)));
      const childExpenses = sum(callExpenses.map((item) => item.amount));
      const expenseCost = childExpenses > 0 ? childExpenses : Math.max(0, call.expensesAmount || 0);
      const totalCost = materialCost + serviceCost + equipmentCost + expenseCost;
      const derivedItemRevenue = materialRevenue + serviceRevenue;

      const financial = financialByCall.get(call.id);
      const linkedSale = call.saleId ? saleById.get(call.saleId) : undefined;
      let revenueAmount: number | null = null;
      let revenueSource = "Não atribuída";
      let estimated = false;

      if (financial?.revenueAmount !== null && financial?.revenueAmount !== undefined) {
        revenueAmount = Math.max(0, Number(financial.revenueAmount));
        revenueSource = "Receita atribuída manualmente";
      } else if (linkedSale && call.saleId && callsPerSale.get(call.saleId) === 1) {
        revenueAmount = Math.max(0, linkedSale.total);
        revenueSource = `Venda vinculada ${linkedSale.number}`;
      } else if (derivedItemRevenue > 0) {
        revenueAmount = derivedItemRevenue;
        revenueSource = "Itens lançados na OS";
        estimated = true;
      }

      const marginAmount = revenueAmount === null ? null : revenueAmount - totalCost;
      const marginPercent = revenueAmount && marginAmount !== null ? (marginAmount / revenueAmount) * 100 : null;

      return {
        id: call.id,
        number: call.number,
        companyName: call.companyName,
        technician: call.technician,
        status: call.status,
        saleId: call.saleId,
        createdAt: call.createdAt,
        materialCost,
        serviceCost,
        equipmentCost,
        expenseCost,
        totalCost,
        revenueAmount,
        revenueSource,
        estimated,
        marginAmount,
        marginPercent,
        notes: financial?.notes ?? null,
        revenueOverride: financial?.revenueAmount ?? null,
      };
    });

    const allocated = rows.filter((row) => row.revenueAmount !== null);
    const totalRevenue = sum(allocated.map((row) => row.revenueAmount ?? 0));
    const allocatedCost = sum(allocated.map((row) => row.totalCost));
    const totalCost = sum(rows.map((row) => row.totalCost));
    const totalMargin = totalRevenue - allocatedCost;

    return Response.json({
      rows,
      summary: {
        totalRevenue,
        totalCost,
        allocatedCost,
        totalMargin,
        marginPercent: totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : null,
        allocatedCalls: allocated.length,
        unallocatedCalls: rows.length - allocated.length,
      },
    });
  } catch {
    return Response.json({ error: "Não foi possível calcular a rentabilidade das OS." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requirePermission("service_profitability");
  if (denied) return denied;
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureFinancialTable();
    const payload = (await request.json()) as Record<string, unknown>;
    const serviceCallId = Number(payload.serviceCallId);
    const rawRevenue = payload.revenueAmount;
    const revenueAmount = rawRevenue === null || rawRevenue === "" ? null : Number(rawRevenue);
    if (!serviceCallId || (revenueAmount !== null && (!Number.isFinite(revenueAmount) || revenueAmount < 0))) {
      return Response.json({ error: "Informe uma OS e uma receita válidas." }, { status: 400 });
    }
    const db = getDb();
    const [call] = await db.select({ id: serviceCalls.id }).from(serviceCalls).where(eq(serviceCalls.id, serviceCallId)).limit(1);
    if (!call) return Response.json({ error: "OS não encontrada." }, { status: 404 });
    const [existing] = await db.select().from(serviceCallFinancials).where(eq(serviceCallFinancials.serviceCallId, serviceCallId)).limit(1);
    const values = {
      revenueAmount,
      notes: String(payload.notes ?? "").trim() || null,
      updatedBy: user.displayName,
      updatedAt: new Date().toISOString(),
    };
    if (existing) {
      await db.update(serviceCallFinancials).set(values).where(eq(serviceCallFinancials.id, existing.id));
    } else {
      await db.insert(serviceCallFinancials).values({ serviceCallId, ...values });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a receita da OS." }, { status: 500 });
  }
}
