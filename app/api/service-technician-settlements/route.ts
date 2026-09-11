import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireServiceCostAccess } from "@/app/service-technician-access";
import { ensureServiceTechnicianSettlementTables } from "@/app/service-technician-settlement-runtime";
import { getDb } from "@/db";
import { payables, serviceCalls, suppliers } from "@/db/schema";
import { serviceCallTechnicians, serviceTechnicians } from "@/db/service-technician-schema";
import {
  serviceTechnicianSettlementAudit,
  serviceTechnicianSettlementItems,
  serviceTechnicianSettlements,
} from "@/db/service-technician-settlement-schema";

const validDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
const text = (value: unknown) => String(value ?? "").trim();
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (values: number[]) => round2(values.reduce((total, value) => total + value, 0));

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

function serviceDate(call: typeof serviceCalls.$inferSelect | undefined, assignment: typeof serviceCallTechnicians.$inferSelect) {
  return (call?.scheduledAt ?? assignment.approvedAt ?? assignment.assignedAt).slice(0, 10);
}

async function audit(args: {
  settlementId?: number | null;
  itemId?: number | null;
  technicianId?: number | null;
  action: string;
  performedBy: string;
  note?: string | null;
  before?: unknown;
  after?: unknown;
}) {
  await getDb().insert(serviceTechnicianSettlementAudit).values({
    settlementId: args.settlementId ?? null,
    itemId: args.itemId ?? null,
    technicianId: args.technicianId ?? null,
    action: args.action,
    performedBy: args.performedBy,
    note: args.note ?? null,
    beforeJson: args.before === undefined ? null : JSON.stringify(args.before),
    afterJson: args.after === undefined ? null : JSON.stringify(args.after),
  });
}

async function recomputeSettlement(settlementId: number) {
  const db = getDb();
  const items = await db.select().from(serviceTechnicianSettlementItems).where(eq(serviceTechnicianSettlementItems.settlementId, settlementId));
  const subtotal = sum(items.map((item) => Math.max(0, item.approvedAmountSnapshot - item.reimbursementSnapshot)));
  const reimbursementTotal = sum(items.map((item) => Math.max(0, item.reimbursementSnapshot)));
  const adjustmentTotal = sum(items.map((item) => item.divergenceAmount));
  const totalAmount = sum(items.map((item) => Math.max(0, item.settlementAmount)));
  const now = new Date().toISOString();
  const [settlement] = await db.update(serviceTechnicianSettlements).set({
    subtotal,
    reimbursementTotal,
    adjustmentTotal,
    totalAmount,
    itemCount: items.length,
    updatedAt: now,
  }).where(eq(serviceTechnicianSettlements.id, settlementId)).returning();
  return { settlement, items };
}

async function loadData(from?: string | null, to?: string | null) {
  const db = getDb();
  const [settlements, items, technicians, assignments, calls, supplierRows, payableRows, auditRows] = await Promise.all([
    db.select().from(serviceTechnicianSettlements),
    db.select().from(serviceTechnicianSettlementItems),
    db.select().from(serviceTechnicians),
    db.select().from(serviceCallTechnicians),
    db.select().from(serviceCalls),
    db.select().from(suppliers),
    db.select().from(payables),
    db.select().from(serviceTechnicianSettlementAudit),
  ]);
  const techById = new Map(technicians.map((row) => [row.id, row]));
  const callById = new Map(calls.map((row) => [row.id, row]));
  const assignmentById = new Map(assignments.map((row) => [row.id, row]));
  const supplierById = new Map(supplierRows.map((row) => [row.id, row]));
  const payableById = new Map(payableRows.map((row) => [row.id, row]));
  const settlementById = new Map(settlements.map((row) => [row.id, row]));

  const occupiedAssignmentIds = new Set(
    items
      .filter((item) => settlementById.get(item.settlementId)?.status !== "cancelled")
      .map((item) => item.assignmentId),
  );

  const eligible = assignments.flatMap((assignment) => {
    const technician = techById.get(assignment.technicianId);
    const call = callById.get(assignment.serviceCallId);
    if (!technician || !call) return [];
    if (technician.financialMode !== "monthly_consolidated") return [];
    if (assignment.assignmentStatus === "cancelled" || assignment.apportionmentStatus !== "approved") return [];
    if (assignment.realizedCost === null || assignment.payableId || occupiedAssignmentIds.has(assignment.id)) return [];
    if (call.status !== "concluido") return [];
    const date = serviceDate(call, assignment);
    if (from && date < from) return [];
    if (to && date > to) return [];
    const approvedAmount = Math.max(0, Number(assignment.realizedCost ?? assignment.expectedCost ?? 0));
    const reimbursement = Math.max(0, Number(assignment.reimbursementAmount ?? 0));
    return [{
      assignmentId: assignment.id,
      technicianId: technician.id,
      technicianName: technician.name,
      supplierId: technician.supplierId,
      supplierName: technician.supplierId ? supplierById.get(technician.supplierId)?.name ?? null : null,
      requiresInvoice: technician.requiresInvoice,
      dueDays: technician.dueDays,
      serviceCallId: call.id,
      callNumber: call.number,
      companyName: call.companyName,
      location: call.location,
      serviceType: call.serviceType,
      serviceDate: date,
      approvedAmount,
      laborAmount: Math.max(0, round2(approvedAmount - reimbursement)),
      reimbursementAmount: reimbursement,
      role: assignment.role,
      approvedAt: assignment.approvedAt,
    }];
  }).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.callNumber.localeCompare(b.callNumber));

  const enrichedSettlements = settlements
    .map((settlement) => {
      const technician = techById.get(settlement.technicianId);
      const payable = settlement.payableId ? payableById.get(settlement.payableId) : null;
      const settlementItems = items
        .filter((item) => item.settlementId === settlement.id)
        .map((item) => {
          const assignment = assignmentById.get(item.assignmentId);
          const call = callById.get(item.serviceCallId);
          return {
            ...item,
            callNumber: call?.number ?? null,
            companyName: call?.companyName ?? null,
            location: call?.location ?? null,
            serviceType: call?.serviceType ?? null,
            serviceDate: assignment ? serviceDate(call, assignment) : null,
            role: assignment?.role ?? null,
            assignmentStatus: assignment?.assignmentStatus ?? null,
            apportionmentStatus: assignment?.apportionmentStatus ?? null,
          };
        })
        .sort((a, b) => String(a.serviceDate ?? "").localeCompare(String(b.serviceDate ?? "")) || (a.callNumber ?? "").localeCompare(b.callNumber ?? ""));
      return {
        ...settlement,
        technicianName: technician?.name ?? "Técnico removido",
        relationshipType: technician?.relationshipType ?? null,
        financialMode: technician?.financialMode ?? null,
        requiresInvoice: technician?.requiresInvoice ?? false,
        dueDays: technician?.dueDays ?? 0,
        supplierName: settlement.supplierId ? supplierById.get(settlement.supplierId)?.name ?? null : technician?.supplierId ? supplierById.get(technician.supplierId)?.name ?? null : null,
        items: settlementItems,
        payable: payable ? {
          id: payable.id,
          groupNumber: payable.groupNumber,
          amount: payable.amount,
          dueDate: payable.dueDate,
          paidAmount: payable.paidAmount,
          paymentDate: payable.paymentDate,
          status: payable.status,
        } : null,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);

  const active = enrichedSettlements.filter((row) => row.status !== "cancelled");
  return {
    technicians: technicians
      .filter((row) => row.active && row.financialMode === "monthly_consolidated")
      .map((row) => ({
        ...row,
        supplierName: row.supplierId ? supplierById.get(row.supplierId)?.name ?? null : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    eligible,
    settlements: enrichedSettlements,
    audit: auditRows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).slice(0, 100),
    summary: {
      eligibleCount: eligible.length,
      eligibleTotal: sum(eligible.map((row) => row.approvedAmount)),
      draftCount: active.filter((row) => row.status === "draft").length,
      reviewCount: active.filter((row) => row.status === "in_review").length,
      approvedCount: active.filter((row) => row.status === "approved").length,
      payableGeneratedCount: active.filter((row) => row.status === "payable_generated").length,
      activeTotal: sum(active.filter((row) => row.status !== "payable_generated").map((row) => row.totalAmount)),
      generatedTotal: sum(active.filter((row) => row.status === "payable_generated").map((row) => row.totalAmount)),
    },
  };
}

export async function GET(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  try {
    await ensureServiceTechnicianSettlementTables();
    const url = new URL(request.url);
    const from = validDate(url.searchParams.get("from")) ? url.searchParams.get("from") : null;
    const to = validDate(url.searchParams.get("to")) ? url.searchParams.get("to") : null;
    return Response.json(await loadData(from, to));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar os fechamentos de técnicos." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureServiceTechnicianSettlementTables();
    const payload = await request.json() as Record<string, unknown>;
    const technicianId = Number(payload.technicianId);
    const periodFrom = text(payload.periodFrom);
    const periodTo = text(payload.periodTo);
    const assignmentIds = Array.from(new Set((Array.isArray(payload.assignmentIds) ? payload.assignmentIds : []).map(Number).filter(Boolean)));
    if (!technicianId || !validDate(periodFrom) || !validDate(periodTo) || periodFrom > periodTo) {
      return Response.json({ error: "Informe técnico e período válidos para o fechamento." }, { status: 400 });
    }
    if (!assignmentIds.length) return Response.json({ error: "Selecione ao menos uma OS aprovada para o fechamento." }, { status: 400 });

    const db = getDb();
    const [[technician], assignments, calls, settlements, items] = await Promise.all([
      db.select().from(serviceTechnicians).where(eq(serviceTechnicians.id, technicianId)).limit(1),
      db.select().from(serviceCallTechnicians),
      db.select().from(serviceCalls),
      db.select().from(serviceTechnicianSettlements),
      db.select().from(serviceTechnicianSettlementItems),
    ]);
    if (!technician || !technician.active) return Response.json({ error: "Técnico não encontrado ou inativo." }, { status: 404 });
    if (technician.financialMode !== "monthly_consolidated") return Response.json({ error: "Este técnico não está configurado para consolidação mensal." }, { status: 409 });

    const callById = new Map(calls.map((row) => [row.id, row]));
    const settlementById = new Map(settlements.map((row) => [row.id, row]));
    const occupied = new Set(items.filter((item) => settlementById.get(item.settlementId)?.status !== "cancelled").map((item) => item.assignmentId));
    const selected = assignmentIds.map((id) => assignments.find((row) => row.id === id)).filter(Boolean) as typeof assignments;
    if (selected.length !== assignmentIds.length) return Response.json({ error: "Uma ou mais apurações selecionadas não foram encontradas." }, { status: 404 });

    for (const assignment of selected) {
      const call = callById.get(assignment.serviceCallId);
      const date = serviceDate(call, assignment);
      if (assignment.technicianId !== technicianId || assignment.assignmentStatus === "cancelled" || assignment.apportionmentStatus !== "approved" || assignment.realizedCost === null || assignment.payableId) {
        return Response.json({ error: "Todas as OS precisam estar aprovadas, sem título financeiro e vinculadas ao mesmo técnico." }, { status: 409 });
      }
      if (!call || call.status !== "concluido" || date < periodFrom || date > periodTo) {
        return Response.json({ error: `A OS ${call?.number ?? assignment.serviceCallId} não pertence ao período informado ou ainda não está concluída.` }, { status: 409 });
      }
      if (occupied.has(assignment.id)) return Response.json({ error: `A OS ${call.number} já participa de outro fechamento ativo.` }, { status: 409 });
    }

    const now = new Date().toISOString();
    const [settlement] = await db.insert(serviceTechnicianSettlements).values({
      technicianId,
      supplierId: technician.supplierId,
      periodFrom,
      periodTo,
      status: "draft",
      notes: text(payload.notes) || null,
      createdBy: auth.email,
      updatedAt: now,
    }).returning();

    for (const assignment of selected) {
      const approvedAmount = Math.max(0, Number(assignment.realizedCost ?? assignment.expectedCost ?? 0));
      const reimbursement = Math.max(0, Number(assignment.reimbursementAmount ?? 0));
      await db.insert(serviceTechnicianSettlementItems).values({
        settlementId: settlement.id,
        assignmentId: assignment.id,
        serviceCallId: assignment.serviceCallId,
        approvedAmountSnapshot: approvedAmount,
        reimbursementSnapshot: reimbursement,
        settlementAmount: approvedAmount,
        divergenceAmount: 0,
        updatedAt: now,
      });
    }
    const result = await recomputeSettlement(settlement.id);
    await audit({
      settlementId: settlement.id,
      technicianId,
      action: "created",
      performedBy: auth.email,
      note: `${selected.length} OS · ${periodFrom} a ${periodTo} · R$ ${result.settlement.totalAmount.toFixed(2)}`,
      after: result.settlement,
    });
    return Response.json({ settlement: result.settlement }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar o fechamento." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureServiceTechnicianSettlementTables();
    const payload = await request.json() as Record<string, unknown>;
    const action = text(payload.action);
    const id = Number(payload.id);
    if (!id) return Response.json({ error: "Fechamento inválido." }, { status: 400 });
    const db = getDb();
    let [settlement] = await db.select().from(serviceTechnicianSettlements).where(eq(serviceTechnicianSettlements.id, id)).limit(1);
    if (!settlement) return Response.json({ error: "Fechamento não encontrado." }, { status: 404 });
    const [technician] = await db.select().from(serviceTechnicians).where(eq(serviceTechnicians.id, settlement.technicianId)).limit(1);
    if (!technician) return Response.json({ error: "Técnico do fechamento não foi encontrado." }, { status: 404 });
    const now = new Date().toISOString();

    if (action === "update_item") {
      if (!["draft", "in_review"].includes(settlement.status)) return Response.json({ error: "Itens só podem ser ajustados antes da aprovação do fechamento." }, { status: 409 });
      const itemId = Number(payload.itemId);
      const value = Number(payload.settlementAmount);
      if (!itemId || !Number.isFinite(value) || value < 0) return Response.json({ error: "Informe um valor válido para a linha." }, { status: 400 });
      const [item] = await db.select().from(serviceTechnicianSettlementItems).where(eq(serviceTechnicianSettlementItems.id, itemId)).limit(1);
      if (!item || item.settlementId !== id) return Response.json({ error: "Linha do fechamento não encontrada." }, { status: 404 });
      const rounded = round2(value);
      const divergence = round2(rounded - item.approvedAmountSnapshot);
      const reason = text(payload.divergenceReason);
      if (Math.abs(divergence) >= 0.01 && !reason) return Response.json({ error: "Informe o motivo da divergência entre a OS aprovada e o valor do fechamento." }, { status: 400 });
      const [updated] = await db.update(serviceTechnicianSettlementItems).set({
        settlementAmount: rounded,
        divergenceAmount: divergence,
        divergenceReason: Math.abs(divergence) >= 0.01 ? reason : null,
        updatedAt: now,
      }).where(eq(serviceTechnicianSettlementItems.id, itemId)).returning();
      const recomputed = await recomputeSettlement(id);
      await audit({ settlementId: id, itemId, technicianId: settlement.technicianId, action: "item_adjusted", performedBy: auth.email, note: `${item.approvedAmountSnapshot.toFixed(2)} → ${rounded.toFixed(2)}${reason ? ` · ${reason}` : ""}`, before: item, after: updated });
      return Response.json({ settlement: recomputed.settlement, item: updated });
    }

    if (action === "remove_item") {
      if (!["draft", "in_review"].includes(settlement.status)) return Response.json({ error: "Itens só podem ser removidos antes da aprovação do fechamento." }, { status: 409 });
      const itemId = Number(payload.itemId);
      const [item] = await db.select().from(serviceTechnicianSettlementItems).where(eq(serviceTechnicianSettlementItems.id, itemId)).limit(1);
      if (!item || item.settlementId !== id) return Response.json({ error: "Linha do fechamento não encontrada." }, { status: 404 });
      await db.delete(serviceTechnicianSettlementItems).where(eq(serviceTechnicianSettlementItems.id, itemId));
      const recomputed = await recomputeSettlement(id);
      await audit({ settlementId: id, itemId, technicianId: settlement.technicianId, action: "item_removed", performedBy: auth.email, note: `OS ${item.serviceCallId} removida do fechamento.`, before: item });
      return Response.json({ settlement: recomputed.settlement });
    }

    if (action === "update_header") {
      if (!["draft", "in_review"].includes(settlement.status)) return Response.json({ error: "Dados fiscais só podem ser alterados antes da aprovação." }, { status: 409 });
      const before = settlement;
      [settlement] = await db.update(serviceTechnicianSettlements).set({
        invoiceNumber: text(payload.invoiceNumber) || null,
        invoiceDate: validDate(payload.invoiceDate) ? text(payload.invoiceDate) : null,
        notes: text(payload.notes) || null,
        updatedAt: now,
      }).where(eq(serviceTechnicianSettlements.id, id)).returning();
      await audit({ settlementId: id, technicianId: settlement.technicianId, action: "header_updated", performedBy: auth.email, note: settlement.invoiceNumber ? `NF ${settlement.invoiceNumber}` : "Dados do fechamento atualizados.", before, after: settlement });
      return Response.json({ settlement });
    }

    if (action === "submit") {
      if (settlement.status !== "draft") return Response.json({ error: "Somente um fechamento em rascunho pode ser enviado para conferência." }, { status: 409 });
      const recomputed = await recomputeSettlement(id);
      if (!recomputed.items.length || recomputed.settlement.totalAmount <= 0) return Response.json({ error: "O fechamento precisa ter ao menos uma OS e valor maior que zero." }, { status: 409 });
      [settlement] = await db.update(serviceTechnicianSettlements).set({ status: "in_review", submittedBy: auth.email, submittedAt: now, updatedAt: now }).where(eq(serviceTechnicianSettlements.id, id)).returning();
      await audit({ settlementId: id, technicianId: settlement.technicianId, action: "submitted", performedBy: auth.email, note: `${settlement.itemCount} OS · R$ ${settlement.totalAmount.toFixed(2)}` });
      return Response.json({ settlement });
    }

    if (action === "approve") {
      if (settlement.status !== "in_review") return Response.json({ error: "Envie o fechamento para conferência antes da aprovação." }, { status: 409 });
      const recomputed = await recomputeSettlement(id);
      settlement = recomputed.settlement;
      if (!recomputed.items.length || settlement.totalAmount <= 0) return Response.json({ error: "O fechamento precisa ter ao menos uma OS e valor maior que zero." }, { status: 409 });
      if (!technician.supplierId) return Response.json({ error: "Vincule um fornecedor ao técnico antes de aprovar o fechamento." }, { status: 409 });
      if (technician.requiresInvoice && !settlement.invoiceNumber) return Response.json({ error: "Este técnico exige nota fiscal. Informe o número da NF antes de aprovar." }, { status: 409 });
      const dueDate = addDays(saoPauloDate(), technician.dueDays);
      [settlement] = await db.update(serviceTechnicianSettlements).set({
        status: "approved",
        supplierId: technician.supplierId,
        approvedBy: auth.email,
        approvedAt: now,
        dueDate,
        updatedAt: now,
      }).where(eq(serviceTechnicianSettlements.id, id)).returning();
      await audit({ settlementId: id, technicianId: settlement.technicianId, action: "approved", performedBy: auth.email, note: `R$ ${settlement.totalAmount.toFixed(2)} · vencimento previsto ${dueDate}` });
      return Response.json({ settlement });
    }

    if (action === "return_to_review") {
      if (settlement.status !== "approved" || settlement.payableId) return Response.json({ error: "Só é possível devolver para conferência antes da geração da conta a pagar." }, { status: 409 });
      [settlement] = await db.update(serviceTechnicianSettlements).set({
        status: "in_review",
        approvedBy: null,
        approvedAt: null,
        dueDate: null,
        updatedAt: now,
      }).where(eq(serviceTechnicianSettlements.id, id)).returning();
      await audit({ settlementId: id, technicianId: settlement.technicianId, action: "returned_to_review", performedBy: auth.email, note: text(payload.note) || "Fechamento devolvido para conferência." });
      return Response.json({ settlement });
    }

    if (action === "generate_payable") {
      if (settlement.status !== "approved" || settlement.payableId) return Response.json({ error: "A conta a pagar só pode ser gerada uma vez após a aprovação do fechamento." }, { status: 409 });
      const supplierId = settlement.supplierId ?? technician.supplierId;
      if (!supplierId) return Response.json({ error: "Fornecedor do técnico não está vinculado." }, { status: 409 });
      const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId)).limit(1);
      if (!supplier) return Response.json({ error: "Fornecedor do técnico não foi encontrado." }, { status: 409 });
      const items = await db.select().from(serviceTechnicianSettlementItems).where(eq(serviceTechnicianSettlementItems.settlementId, id));
      if (!items.length) return Response.json({ error: "O fechamento não possui OS." }, { status: 409 });
      for (const item of items) {
        const [assignment] = await db.select().from(serviceCallTechnicians).where(eq(serviceCallTechnicians.id, item.assignmentId)).limit(1);
        if (!assignment || assignment.apportionmentStatus !== "approved" || assignment.payableId || assignment.realizedCost === null) {
          return Response.json({ error: "Uma das OS foi alterada depois da aprovação do fechamento. Devolva o fechamento para conferência antes de prosseguir." }, { status: 409 });
        }
        if (Math.abs(round2(assignment.realizedCost) - round2(item.approvedAmountSnapshot)) >= 0.01) {
          return Response.json({ error: "O custo aprovado de uma das OS mudou depois da criação do fechamento. Devolva para conferência e refaça a composição." }, { status: 409 });
        }
      }
      const dueDate = settlement.dueDate ?? addDays(saoPauloDate(), technician.dueDays);
      const periodLabel = `${settlement.periodFrom} a ${settlement.periodTo}`;
      const [payable] = await db.insert(payables).values({
        supplierId: supplier.id,
        companyId: null,
        project: `Fechamento técnico ${periodLabel}`,
        groupNumber: `TEC-FECH-${settlement.id}`,
        reference: settlement.invoiceNumber ? `NF ${settlement.invoiceNumber}` : `FECH-${settlement.id}`,
        description: `Fechamento de atendimentos técnicos - ${technician.name} - ${periodLabel}`,
        category: "servicos",
        installmentNumber: 1,
        installmentCount: 1,
        amount: settlement.totalAmount,
        dueDate,
        paidAmount: 0,
        status: "aberto",
        updatedAt: now,
      }).returning();
      for (const item of items) {
        await db.update(serviceCallTechnicians).set({
          payableId: payable.id,
          apportionmentStatus: "payable_generated",
          updatedAt: now,
        }).where(eq(serviceCallTechnicians.id, item.assignmentId));
      }
      [settlement] = await db.update(serviceTechnicianSettlements).set({
        payableId: payable.id,
        dueDate,
        status: "payable_generated",
        updatedAt: now,
      }).where(eq(serviceTechnicianSettlements.id, id)).returning();
      await audit({ settlementId: id, technicianId: settlement.technicianId, action: "payable_generated", performedBy: auth.email, note: `${payable.groupNumber} · ${items.length} OS · R$ ${payable.amount.toFixed(2)} · vence ${dueDate}` });
      return Response.json({ settlement, payable });
    }

    if (action === "cancel") {
      if (settlement.payableId || settlement.status === "payable_generated") return Response.json({ error: "O fechamento já gerou conta a pagar e não pode ser cancelado por aqui." }, { status: 409 });
      if (settlement.status === "cancelled") return Response.json({ error: "Este fechamento já está cancelado." }, { status: 409 });
      [settlement] = await db.update(serviceTechnicianSettlements).set({ status: "cancelled", updatedAt: now }).where(eq(serviceTechnicianSettlements.id, id)).returning();
      await audit({ settlementId: id, technicianId: settlement.technicianId, action: "cancelled", performedBy: auth.email, note: text(payload.note) || "Fechamento cancelado; as OS foram liberadas para um novo fechamento." });
      return Response.json({ settlement });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o fechamento." }, { status: 500 });
  }
}
