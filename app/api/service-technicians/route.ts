import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireServiceCostAccess } from "@/app/service-technician-access";
import { serviceRemunerationTypes } from "@/app/service-technician-costing";
import { ensureServiceTechnicianTables } from "@/app/service-technician-runtime";
import { getDb } from "@/db";
import { companies, suppliers, users } from "@/db/schema";
import { serviceTechnicianAudit, serviceTechnicianRateRules, serviceTechnicians } from "@/db/service-technician-schema";

const relationshipTypes = new Set(["employee_clt", "employee_pj", "freelancer", "partner_company"]);
const financialModes = new Set(["managerial_only", "per_service", "monthly_consolidated"]);
const remunerationTypes = new Set<string>(serviceRemunerationTypes);

const text = (value: unknown) => String(value ?? "").trim();
const nullableText = (value: unknown) => text(value) || null;
const numberOrNull = (value: unknown) => value === null || value === undefined || value === "" ? null : Number(value);
const nonNegative = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

async function ensureSupplier(args: { supplierId?: number | null; name: string; document?: string | null; email?: string | null; phone?: string | null }) {
  const db = getDb();
  if (args.supplierId) {
    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, args.supplierId)).limit(1);
    if (!supplier) throw new Error("Fornecedor vinculado ao técnico não foi encontrado.");
    return supplier;
  }
  const all = await db.select().from(suppliers);
  const existing = all.find((row) => row.name.trim().toLowerCase() === args.name.trim().toLowerCase());
  if (existing) return existing;
  const [supplier] = await db.insert(suppliers).values({
    name: args.name,
    document: args.document ?? null,
    email: args.email ?? null,
    phone: args.phone ?? null,
  }).returning();
  return supplier;
}

async function audit(args: { technicianId?: number | null; action: string; performedBy: string; note?: string | null }) {
  await getDb().insert(serviceTechnicianAudit).values({
    technicianId: args.technicianId ?? null,
    assignmentId: null,
    serviceCallId: null,
    action: args.action,
    performedBy: args.performedBy,
    note: args.note ?? null,
  });
}

export async function GET() {
  const denied = await requireServiceCostAccess();
  if (denied) return denied;
  try {
    await ensureServiceTechnicianTables();
    const db = getDb();
    const [technicians, rateRules, supplierRows, companyRows, userRows] = await Promise.all([
      db.select().from(serviceTechnicians),
      db.select().from(serviceTechnicianRateRules),
      db.select().from(suppliers),
      db.select().from(companies),
      db.select().from(users),
    ]);
    const suppliersById = new Map(supplierRows.map((row) => [row.id, row]));
    const companiesById = new Map(companyRows.map((row) => [row.id, row]));
    const usersById = new Map(userRows.map((row) => [row.id, row]));
    return Response.json({
      technicians: technicians.map((row) => ({
        ...row,
        supplierName: row.supplierId ? suppliersById.get(row.supplierId)?.name ?? null : null,
        linkedUserName: row.userId ? usersById.get(row.userId)?.name ?? null : null,
      })).sort((a, b) => a.name.localeCompare(b.name)),
      rateRules: rateRules.map((row) => ({
        ...row,
        technicianName: row.technicianId ? technicians.find((tech) => tech.id === row.technicianId)?.name ?? null : "Padrão TDK",
        companyName: row.companyId ? companiesById.get(row.companyId)?.name ?? null : null,
      })).sort((a, b) => Number(b.active) - Number(a.active) || b.priority - a.priority || b.id - a.id),
      suppliers: supplierRows.sort((a, b) => a.name.localeCompare(b.name)),
      companies: companyRows.filter((row) => row.isClient).sort((a, b) => a.name.localeCompare(b.name)),
      users: userRows.filter((row) => row.active).map((row) => ({ id: row.id, name: row.name, email: row.email, jobTitle: row.jobTitle })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar técnicos e tabelas." }, { status: 503 });
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
    const action = text(payload.action) || "technician";
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "technician") {
      const name = text(payload.name);
      const relationshipType = text(payload.relationshipType) || "freelancer";
      const financialMode = text(payload.financialMode) || "per_service";
      if (!name) return Response.json({ error: "Informe o nome do técnico ou parceiro." }, { status: 400 });
      if (!relationshipTypes.has(relationshipType) || !financialModes.has(financialMode)) return Response.json({ error: "Vínculo ou modo financeiro inválido." }, { status: 400 });
      const document = nullableText(payload.document), email = nullableText(payload.email), phone = nullableText(payload.phone);
      let supplierId = Number(payload.supplierId) || null;
      if (financialMode !== "managerial_only") {
        const supplier = await ensureSupplier({ supplierId, name, document, email, phone });
        supplierId = supplier.id;
      }
      const monthlyCost = numberOrNull(payload.monthlyCost);
      const monthlyProductiveHours = nonNegative(payload.monthlyProductiveHours, 160) || 160;
      const [technician] = await db.insert(serviceTechnicians).values({
        userId: Number(payload.userId) || null,
        supplierId,
        name,
        document,
        email,
        phone,
        relationshipType,
        financialMode,
        paymentMethod: nullableText(payload.paymentMethod),
        pixKey: nullableText(payload.pixKey),
        dueDays: Math.max(0, Math.round(nonNegative(payload.dueDays, 7))),
        requiresInvoice: Boolean(payload.requiresInvoice),
        monthlyCost: monthlyCost !== null && Number.isFinite(monthlyCost) && monthlyCost >= 0 ? monthlyCost : null,
        monthlyProductiveHours,
        active: payload.active === undefined ? true : Boolean(payload.active),
        notes: nullableText(payload.notes),
        updatedAt: now,
      }).returning();
      await audit({ technicianId: technician.id, action: "technician_created", performedBy: auth.email, note: `${relationshipType} · ${financialMode}` });
      return Response.json({ technician }, { status: 201 });
    }

    if (action === "rate_rule") {
      const remunerationType = text(payload.remunerationType) || "per_visit";
      const amount = nonNegative(payload.amount, -1);
      if (!remunerationTypes.has(remunerationType) || amount < 0) return Response.json({ error: "Tipo de remuneração ou valor inválido." }, { status: 400 });
      const technicianId = Number(payload.technicianId) || null;
      if (technicianId) {
        const [technician] = await db.select().from(serviceTechnicians).where(eq(serviceTechnicians.id, technicianId)).limit(1);
        if (!technician) return Response.json({ error: "Técnico não encontrado." }, { status: 404 });
      }
      const [rule] = await db.insert(serviceTechnicianRateRules).values({
        technicianId,
        companyId: Number(payload.companyId) || null,
        serviceType: nullableText(payload.serviceType),
        region: nullableText(payload.region),
        remunerationType,
        amount,
        minimumHours: nonNegative(payload.minimumHours),
        nightSurchargePct: nonNegative(payload.nightSurchargePct),
        weekendSurchargePct: nonNegative(payload.weekendSurchargePct),
        priority: Math.round(Number(payload.priority) || 0),
        effectiveFrom: nullableText(payload.effectiveFrom),
        effectiveTo: nullableText(payload.effectiveTo),
        active: payload.active === undefined ? true : Boolean(payload.active),
        notes: nullableText(payload.notes),
        updatedAt: now,
      }).returning();
      await audit({ technicianId, action: "rate_rule_created", performedBy: auth.email, note: `${remunerationType} · R$ ${amount.toFixed(2)}` });
      return Response.json({ rule }, { status: 201 });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o cadastro técnico." }, { status: 500 });
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
    const action = text(payload.action) || "technician";
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Cadastro inválido." }, { status: 400 });
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "technician") {
      const [current] = await db.select().from(serviceTechnicians).where(eq(serviceTechnicians.id, id)).limit(1);
      if (!current) return Response.json({ error: "Técnico não encontrado." }, { status: 404 });
      const name = text(payload.name ?? current.name);
      const relationshipType = text(payload.relationshipType ?? current.relationshipType);
      const financialMode = text(payload.financialMode ?? current.financialMode);
      if (!name || !relationshipTypes.has(relationshipType) || !financialModes.has(financialMode)) return Response.json({ error: "Revise nome, vínculo e modo financeiro." }, { status: 400 });
      const document = nullableText(payload.document ?? current.document), email = nullableText(payload.email ?? current.email), phone = nullableText(payload.phone ?? current.phone);
      let supplierId = Number(payload.supplierId ?? current.supplierId) || null;
      if (financialMode !== "managerial_only") {
        const supplier = await ensureSupplier({ supplierId, name, document, email, phone });
        supplierId = supplier.id;
      }
      const [technician] = await db.update(serviceTechnicians).set({
        userId: Number(payload.userId ?? current.userId) || null,
        supplierId,
        name,
        document,
        email,
        phone,
        relationshipType,
        financialMode,
        paymentMethod: nullableText(payload.paymentMethod ?? current.paymentMethod),
        pixKey: nullableText(payload.pixKey ?? current.pixKey),
        dueDays: Math.max(0, Math.round(nonNegative(payload.dueDays ?? current.dueDays, 7))),
        requiresInvoice: payload.requiresInvoice === undefined ? current.requiresInvoice : Boolean(payload.requiresInvoice),
        monthlyCost: payload.monthlyCost === undefined ? current.monthlyCost : numberOrNull(payload.monthlyCost),
        monthlyProductiveHours: nonNegative(payload.monthlyProductiveHours ?? current.monthlyProductiveHours, 160) || 160,
        active: payload.active === undefined ? current.active : Boolean(payload.active),
        notes: payload.notes === undefined ? current.notes : nullableText(payload.notes),
        updatedAt: now,
      }).where(eq(serviceTechnicians.id, id)).returning();
      await audit({ technicianId: id, action: "technician_updated", performedBy: auth.email, note: `${relationshipType} · ${financialMode}` });
      return Response.json({ technician });
    }

    if (action === "rate_rule") {
      const [current] = await db.select().from(serviceTechnicianRateRules).where(eq(serviceTechnicianRateRules.id, id)).limit(1);
      if (!current) return Response.json({ error: "Regra de remuneração não encontrada." }, { status: 404 });
      const remunerationType = text(payload.remunerationType ?? current.remunerationType);
      if (!remunerationTypes.has(remunerationType)) return Response.json({ error: "Tipo de remuneração inválido." }, { status: 400 });
      const [rule] = await db.update(serviceTechnicianRateRules).set({
        technicianId: payload.technicianId === undefined ? current.technicianId : Number(payload.technicianId) || null,
        companyId: payload.companyId === undefined ? current.companyId : Number(payload.companyId) || null,
        serviceType: payload.serviceType === undefined ? current.serviceType : nullableText(payload.serviceType),
        region: payload.region === undefined ? current.region : nullableText(payload.region),
        remunerationType,
        amount: nonNegative(payload.amount ?? current.amount),
        minimumHours: nonNegative(payload.minimumHours ?? current.minimumHours),
        nightSurchargePct: nonNegative(payload.nightSurchargePct ?? current.nightSurchargePct),
        weekendSurchargePct: nonNegative(payload.weekendSurchargePct ?? current.weekendSurchargePct),
        priority: payload.priority === undefined ? current.priority : Math.round(Number(payload.priority) || 0),
        effectiveFrom: payload.effectiveFrom === undefined ? current.effectiveFrom : nullableText(payload.effectiveFrom),
        effectiveTo: payload.effectiveTo === undefined ? current.effectiveTo : nullableText(payload.effectiveTo),
        active: payload.active === undefined ? current.active : Boolean(payload.active),
        notes: payload.notes === undefined ? current.notes : nullableText(payload.notes),
        updatedAt: now,
      }).where(eq(serviceTechnicianRateRules.id, id)).returning();
      await audit({ technicianId: rule.technicianId, action: "rate_rule_updated", performedBy: auth.email, note: `Regra #${id} · ${remunerationType}` });
      return Response.json({ rule });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o cadastro técnico." }, { status: 500 });
  }
}
