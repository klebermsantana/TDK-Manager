import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireServiceCostAccess } from "@/app/service-technician-access";
import { resolveTechnicianCost } from "@/app/service-technician-costing";
import { ensureServiceTechnicianTables } from "@/app/service-technician-runtime";
import { getDb } from "@/db";
import { payables, serviceCalls, suppliers } from "@/db/schema";
import { serviceCallTechnicians, serviceTechnicianAudit, serviceTechnicianRateRules, serviceTechnicians } from "@/db/service-technician-schema";

const text = (value: unknown) => String(value ?? "").trim();
const optionalAmount = (value: unknown) => value === null || value === undefined || value === "" ? null : Number(value);
const amount = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

function saoPauloDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: string, days: number) {
  const target = new Date(`${date}T12:00:00Z`);
  target.setUTCDate(target.getUTCDate() + Math.max(0, days));
  return target.toISOString().slice(0, 10);
}

async function audit(args: { technicianId?: number | null; assignmentId?: number | null; serviceCallId?: number | null; action: string; performedBy: string; note?: string | null }) {
  await getDb().insert(serviceTechnicianAudit).values({
    technicianId: args.technicianId ?? null,
    assignmentId: args.assignmentId ?? null,
    serviceCallId: args.serviceCallId ?? null,
    action: args.action,
    performedBy: args.performedBy,
    note: args.note ?? null,
  });
}

async function syncLegacyTechnician(serviceCallId: number) {
  const db = getDb();
  const [assignments, technicians] = await Promise.all([
    db.select().from(serviceCallTechnicians).where(eq(serviceCallTechnicians.serviceCallId, serviceCallId)),
    db.select().from(serviceTechnicians),
  ]);
  const technicianById = new Map(technicians.map((row) => [row.id, row]));
  const active = assignments
    .filter((row) => row.assignmentStatus !== "cancelled")
    .sort((a, b) => Number(b.role === "primary") - Number(a.role === "primary") || a.id - b.id);
  const primary = active[0];
  await db.update(serviceCalls).set({
    technician: primary ? technicianById.get(primary.technicianId)?.name ?? null : null,
    updatedAt: new Date().toISOString(),
  }).where(eq(serviceCalls.id, serviceCallId));
}

async function enrichedAssignments(serviceCallId?: number | null) {
  const db = getDb();
  const [assignments, technicians, calls, rules, payableRows, supplierRows] = await Promise.all([
    serviceCallId ? db.select().from(serviceCallTechnicians).where(eq(serviceCallTechnicians.serviceCallId, serviceCallId)) : db.select().from(serviceCallTechnicians),
    db.select().from(serviceTechnicians),
    db.select().from(serviceCalls),
    db.select().from(serviceTechnicianRateRules),
    db.select().from(payables),
    db.select().from(suppliers),
  ]);
  const technicianById = new Map(technicians.map((row) => [row.id, row]));
  const callById = new Map(calls.map((row) => [row.id, row]));
  const ruleById = new Map(rules.map((row) => [row.id, row]));
  const payableById = new Map(payableRows.map((row) => [row.id, row]));
  const supplierById = new Map(supplierRows.map((row) => [row.id, row]));
  return assignments.map((row) => {
    const technician = technicianById.get(row.technicianId);
    const call = callById.get(row.serviceCallId);
    const payable = row.payableId ? payableById.get(row.payableId) : null;
    return {
      ...row,
      technicianName: technician?.name ?? "Técnico removido",
      relationshipType: technician?.relationshipType ?? null,
      financialMode: technician?.financialMode ?? null,
      requiresInvoice: technician?.requiresInvoice ?? false,
      supplierId: technician?.supplierId ?? null,
      supplierName: technician?.supplierId ? supplierById.get(technician.supplierId)?.name ?? null : null,
      callNumber: call?.number ?? null,
      companyName: call?.companyName ?? null,
      serviceType: call?.serviceType ?? null,
      callStatus: call?.status ?? null,
      location: call?.location ?? null,
      rateRule: row.rateRuleId ? ruleById.get(row.rateRuleId) ?? null : null,
      payable: payable ? {
        id: payable.id,
        groupNumber: payable.groupNumber,
        amount: payable.amount,
        dueDate: payable.dueDate,
        paidAmount: payable.paidAmount,
        status: payable.status,
      } : null,
    };
  }).sort((a, b) => b.assignedAt.localeCompare(a.assignedAt) || b.id - a.id);
}

export async function GET(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  try {
    await ensureServiceTechnicianTables();
    const url = new URL(request.url);
    const serviceCallId = Number(url.searchParams.get("serviceCallId")) || null;
    const assignments = await enrichedAssignments(serviceCallId);
    return Response.json({ assignments: serviceCallId ? assignments : assignments.slice(0, 500) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar a apuração dos técnicos." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureServiceTechnicianTables();
    const payload = await request.json() as Record<string, unknown>;
    const serviceCallId = Number(payload.serviceCallId);
    const technicianId = Number(payload.technicianId);
    const role = text(payload.role) === "support" ? "support" : "primary";
    if (!serviceCallId || !technicianId) return Response.json({ error: "Informe a OS e o técnico." }, { status: 400 });
    const db = getDb();
    const [[call], [technician]] = await Promise.all([
      db.select().from(serviceCalls).where(eq(serviceCalls.id, serviceCallId)).limit(1),
      db.select().from(serviceTechnicians).where(eq(serviceTechnicians.id, technicianId)).limit(1),
    ]);
    if (!call) return Response.json({ error: "OS não encontrada." }, { status: 404 });
    if (!technician || !technician.active) return Response.json({ error: "Técnico não encontrado ou inativo." }, { status: 404 });

    const calculation = await resolveTechnicianCost({ serviceCallId, technicianId, hours: 1, quantity: 1, equipmentQty: 0 });
    const now = new Date().toISOString();
    const [existing] = await db.select().from(serviceCallTechnicians)
      .where(eq(serviceCallTechnicians.serviceCallId, serviceCallId));
    const same = existing.find((row) => row.technicianId === technicianId);

    if (role === "primary") {
      for (const row of existing.filter((item) => item.id !== same?.id && item.assignmentStatus !== "cancelled" && item.role === "primary")) {
        await db.update(serviceCallTechnicians).set({ role: "support", updatedAt: now }).where(eq(serviceCallTechnicians.id, row.id));
      }
    }

    let assignment;
    if (same) {
      if (same.assignmentStatus !== "cancelled") return Response.json({ error: "Este técnico já está vinculado à OS." }, { status: 409 });
      [assignment] = await db.update(serviceCallTechnicians).set({
        role,
        assignmentStatus: "assigned",
        assignedAt: now,
        hours: 1,
        quantity: 1,
        equipmentQty: 0,
        negotiatedAmount: null,
        rateRuleId: calculation.rule?.id ?? null,
        remunerationTypeSnapshot: calculation.remunerationType,
        rateAmountSnapshot: calculation.rateAmount,
        surchargeAmount: calculation.surchargeAmount,
        reimbursementAmount: 0,
        expectedCost: calculation.total,
        realizedCost: null,
        costNature: calculation.costNature,
        apportionmentStatus: "planned",
        approvedBy: null,
        approvedAt: null,
        payableId: null,
        notes: text(payload.notes) || null,
        updatedAt: now,
      }).where(eq(serviceCallTechnicians.id, same.id)).returning();
    } else {
      [assignment] = await db.insert(serviceCallTechnicians).values({
        serviceCallId,
        technicianId,
        role,
        assignmentStatus: "assigned",
        hours: 1,
        quantity: 1,
        equipmentQty: 0,
        rateRuleId: calculation.rule?.id ?? null,
        remunerationTypeSnapshot: calculation.remunerationType,
        rateAmountSnapshot: calculation.rateAmount,
        surchargeAmount: calculation.surchargeAmount,
        reimbursementAmount: 0,
        expectedCost: calculation.total,
        costNature: calculation.costNature,
        apportionmentStatus: "planned",
        notes: text(payload.notes) || null,
        updatedAt: now,
      }).returning();
    }
    await syncLegacyTechnician(serviceCallId);
    await audit({ technicianId, assignmentId: assignment.id, serviceCallId, action: "assigned", performedBy: auth.email, note: `${role} · custo previsto R$ ${calculation.total.toFixed(2)} · ${calculation.source}` });
    return Response.json({ assignment, calculation }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível vincular o técnico à OS." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureServiceTechnicianTables();
    const payload = await request.json() as Record<string, unknown>;
    const action = text(payload.action);
    const id = Number(payload.id);
    if (!id) return Response.json({ error: "Vínculo técnico inválido." }, { status: 400 });
    const db = getDb();
    let [assignment] = await db.select().from(serviceCallTechnicians).where(eq(serviceCallTechnicians.id, id)).limit(1);
    if (!assignment) return Response.json({ error: "Vínculo técnico não encontrado." }, { status: 404 });
    const [[technician], [call]] = await Promise.all([
      db.select().from(serviceTechnicians).where(eq(serviceTechnicians.id, assignment.technicianId)).limit(1),
      db.select().from(serviceCalls).where(eq(serviceCalls.id, assignment.serviceCallId)).limit(1),
    ]);
    if (!technician || !call) return Response.json({ error: "Técnico ou OS vinculada não foi encontrada." }, { status: 404 });
    const now = new Date().toISOString();

    if (action === "recalculate" || action === "apportion") {
      if (assignment.payableId) return Response.json({ error: "A apuração não pode ser alterada depois da geração do título financeiro." }, { status: 409 });
      const hours = amount(payload.hours, assignment.hours);
      const quantity = amount(payload.quantity, assignment.quantity);
      const equipmentQty = amount(payload.equipmentQty, assignment.equipmentQty);
      const reimbursementAmount = amount(payload.reimbursementAmount, assignment.reimbursementAmount);
      const negotiatedAmount = Object.prototype.hasOwnProperty.call(payload, "negotiatedAmount")
        ? optionalAmount(payload.negotiatedAmount)
        : assignment.negotiatedAmount;
      if (negotiatedAmount !== null && (!Number.isFinite(negotiatedAmount) || negotiatedAmount < 0)) return Response.json({ error: "Valor negociado inválido." }, { status: 400 });
      const calculation = await resolveTechnicianCost({
        serviceCallId: assignment.serviceCallId,
        technicianId: assignment.technicianId,
        hours,
        quantity,
        equipmentQty,
        negotiatedAmount,
        reimbursementAmount,
      });
      [assignment] = await db.update(serviceCallTechnicians).set({
        hours,
        quantity,
        equipmentQty,
        negotiatedAmount,
        rateRuleId: calculation.rule?.id ?? null,
        remunerationTypeSnapshot: calculation.remunerationType,
        rateAmountSnapshot: calculation.rateAmount,
        surchargeAmount: calculation.surchargeAmount,
        reimbursementAmount,
        expectedCost: calculation.total,
        realizedCost: action === "apportion" ? calculation.total : null,
        costNature: calculation.costNature,
        apportionmentStatus: action === "apportion" ? "submitted" : "planned",
        assignmentStatus: action === "apportion" && call.status === "concluido" ? "completed" : assignment.assignmentStatus,
        approvedBy: null,
        approvedAt: null,
        notes: payload.notes === undefined ? assignment.notes : text(payload.notes) || null,
        updatedAt: now,
      }).where(eq(serviceCallTechnicians.id, id)).returning();
      await audit({ technicianId: technician.id, assignmentId: id, serviceCallId: call.id, action, performedBy: auth.email, note: `Custo ${action === "apportion" ? "apurado" : "recalculado"}: R$ ${calculation.total.toFixed(2)}` });
      return Response.json({ assignment, calculation });
    }

    if (action === "approve") {
      if (assignment.payableId) return Response.json({ error: "Esta apuração já gerou um título financeiro." }, { status: 409 });
      if (call.status !== "concluido") return Response.json({ error: "Conclua a OS antes de aprovar o custo realizado do técnico." }, { status: 409 });
      if (assignment.apportionmentStatus !== "submitted" && assignment.realizedCost === null) return Response.json({ error: "Faça a apuração do atendimento antes da aprovação." }, { status: 409 });
      const realizedCost = assignment.realizedCost ?? assignment.expectedCost;
      [assignment] = await db.update(serviceCallTechnicians).set({
        realizedCost,
        apportionmentStatus: "approved",
        assignmentStatus: "completed",
        approvedBy: auth.email,
        approvedAt: now,
        updatedAt: now,
      }).where(eq(serviceCallTechnicians.id, id)).returning();
      await audit({ technicianId: technician.id, assignmentId: id, serviceCallId: call.id, action: "approved", performedBy: auth.email, note: `Custo aprovado: R$ ${realizedCost.toFixed(2)}` });
      return Response.json({ assignment });
    }

    if (action === "generate_payable") {
      if (assignment.payableId) return Response.json({ error: "Já existe um título a pagar para esta apuração." }, { status: 409 });
      if (assignment.apportionmentStatus !== "approved" || assignment.realizedCost === null) return Response.json({ error: "Aprove o custo realizado antes de gerar a conta a pagar." }, { status: 409 });
      if (technician.financialMode === "managerial_only") return Response.json({ error: "Este técnico está configurado como custo gerencial. O custo entra na rentabilidade, mas não gera conta a pagar por OS." }, { status: 409 });
      if (technician.financialMode === "monthly_consolidated") return Response.json({ error: "Este técnico usa consolidação mensal. A OS registra o custo, mas o título individual não deve ser gerado." }, { status: 409 });
      if (!technician.supplierId) return Response.json({ error: "Vincule um fornecedor ao técnico antes de gerar a conta a pagar." }, { status: 409 });
      const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, technician.supplierId)).limit(1);
      if (!supplier) return Response.json({ error: "Fornecedor do técnico não foi encontrado." }, { status: 409 });
      const dueDate = addDays(saoPauloDate(), technician.dueDays);
      const [payable] = await db.insert(payables).values({
        supplierId: supplier.id,
        companyId: call.companyId,
        project: call.number,
        groupNumber: `TEC-${call.number}-${assignment.id}`,
        reference: call.number,
        description: `Atendimento técnico ${call.number} - ${technician.name}`,
        category: "servicos",
        installmentNumber: 1,
        installmentCount: 1,
        amount: assignment.realizedCost,
        dueDate,
        paidAmount: 0,
        status: "aberto",
        updatedAt: now,
      }).returning();
      [assignment] = await db.update(serviceCallTechnicians).set({
        payableId: payable.id,
        apportionmentStatus: "payable_generated",
        updatedAt: now,
      }).where(eq(serviceCallTechnicians.id, id)).returning();
      await audit({ technicianId: technician.id, assignmentId: id, serviceCallId: call.id, action: "payable_generated", performedBy: auth.email, note: `${payable.groupNumber} · R$ ${payable.amount.toFixed(2)} · vence ${dueDate}` });
      return Response.json({ assignment, payable });
    }

    if (action === "set_primary") {
      if (assignment.assignmentStatus === "cancelled") return Response.json({ error: "Reative o técnico antes de defini-lo como principal." }, { status: 409 });
      const siblings = await db.select().from(serviceCallTechnicians).where(eq(serviceCallTechnicians.serviceCallId, assignment.serviceCallId));
      for (const row of siblings.filter((item) => item.assignmentStatus !== "cancelled")) {
        await db.update(serviceCallTechnicians).set({ role: row.id === id ? "primary" : "support", updatedAt: now }).where(eq(serviceCallTechnicians.id, row.id));
      }
      await syncLegacyTechnician(assignment.serviceCallId);
      await audit({ technicianId: technician.id, assignmentId: id, serviceCallId: call.id, action: "set_primary", performedBy: auth.email, note: "Técnico definido como responsável principal da OS." });
      return Response.json({ ok: true });
    }

    if (action === "cancel") {
      if (assignment.payableId) return Response.json({ error: "Não é possível cancelar o vínculo após gerar a conta a pagar. Estorne/cancele o título financeiro primeiro." }, { status: 409 });
      [assignment] = await db.update(serviceCallTechnicians).set({
        assignmentStatus: "cancelled",
        apportionmentStatus: "cancelled",
        updatedAt: now,
      }).where(eq(serviceCallTechnicians.id, id)).returning();
      await syncLegacyTechnician(assignment.serviceCallId);
      await audit({ technicianId: technician.id, assignmentId: id, serviceCallId: call.id, action: "cancelled", performedBy: auth.email, note: text(payload.note) || "Vínculo técnico cancelado." });
      return Response.json({ assignment });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a apuração técnica." }, { status: 500 });
  }
}
