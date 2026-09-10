import { asc, eq, sql } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requirePermission } from "@/app/authorization";
import { getDb } from "@/db";
import { companies, serviceCalls } from "@/db/schema";
import { serviceCallSlaPolicies } from "@/db/sla-schema";

const validPriorities = new Set(["critica", "alta", "media", "baixa"]);
const defaultPolicies = [
  { priority: "critica", targetMinutes: 240 },
  { priority: "alta", targetMinutes: 480 },
  { priority: "media", targetMinutes: 1440 },
  { priority: "baixa", targetMinutes: 2880 },
];

function cleanPriority(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return validPriorities.has(text) ? text : null;
}

function cleanServiceType(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || null;
}

function cleanCompanyId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanMinutes(value: unknown, allowEmpty = false) {
  if (allowEmpty && (value === null || value === undefined || value === "")) return null;
  const minutes = Math.round(Number(value));
  return Number.isFinite(minutes) && minutes >= 1 && minutes <= 525600
    ? minutes
    : null;
}

async function ensureSlaTable() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS service_call_sla_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER,
      priority TEXT,
      service_type TEXT,
      action_minutes INTEGER,
      attendance_minutes INTEGER,
      target_minutes INTEGER NOT NULL,
      pause_pending INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (company_id) REFERENCES companies(id)
    )
  `));

  const columns = await db.all<{ name: string }>(sql.raw("PRAGMA table_info(service_call_sla_policies)"));
  const names = new Set(columns.map((item) => item.name));
  if (!names.has("action_minutes")) {
    await db.run(sql.raw("ALTER TABLE service_call_sla_policies ADD COLUMN action_minutes INTEGER"));
  }
  if (!names.has("attendance_minutes")) {
    await db.run(sql.raw("ALTER TABLE service_call_sla_policies ADD COLUMN attendance_minutes INTEGER"));
  }

  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_call_sla_company ON service_call_sla_policies(company_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_call_sla_priority ON service_call_sla_policies(priority)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_call_sla_service_type ON service_call_sla_policies(service_type)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_service_call_sla_active ON service_call_sla_policies(active)`));
}

async function ensureDefaults() {
  await ensureSlaTable();
  const existing = await getDb().select({ id: serviceCallSlaPolicies.id }).from(serviceCallSlaPolicies).limit(1);
  if (existing.length) return;
  await getDb().insert(serviceCallSlaPolicies).values(
    defaultPolicies.map((item) => ({
      companyId: null,
      priority: item.priority,
      serviceType: null,
      actionMinutes: null,
      attendanceMinutes: null,
      targetMinutes: item.targetMinutes,
      pausePending: true,
      active: true,
    })),
  );
}

async function hasDuplicateScope(
  companyId: number | null,
  priority: string | null,
  serviceType: string | null,
  exceptId?: number,
) {
  const rows = await getDb().select().from(serviceCallSlaPolicies);
  return rows.some(
    (item) =>
      item.id !== exceptId &&
      item.companyId === companyId &&
      (item.priority ?? null) === priority &&
      (item.serviceType ?? null) === serviceType,
  );
}

export async function GET() {
  if (!(await getChatGPTUser()))
    return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureDefaults();
    const [policies, companyRows, serviceTypeRows] = await Promise.all([
      getDb().select().from(serviceCallSlaPolicies).orderBy(asc(serviceCallSlaPolicies.id)),
      getDb().select({ id: companies.id, name: companies.name }).from(companies).orderBy(asc(companies.name)),
      getDb().select({ serviceType: serviceCalls.serviceType }).from(serviceCalls),
    ]);
    const serviceTypes = [...new Set(serviceTypeRows.map((item) => item.serviceType?.trim().toLowerCase()).filter(Boolean))].sort();
    return Response.json({ policies, companies: companyRows, serviceTypes });
  } catch {
    return Response.json({ error: "Não foi possível carregar as políticas de SLA." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;

  try {
    await ensureDefaults();
    const payload = (await request.json()) as Record<string, unknown>;
    const companyId = cleanCompanyId(payload.companyId);
    const priority = payload.priority === null || payload.priority === "" ? null : cleanPriority(payload.priority);
    const serviceType = cleanServiceType(payload.serviceType);
    const actionMinutes = cleanMinutes(payload.actionMinutes, true);
    const attendanceMinutes = cleanMinutes(payload.attendanceMinutes, true);
    const targetMinutes = cleanMinutes(payload.targetMinutes);
    const pausePending = payload.pausePending !== false;

    if (payload.priority && !priority)
      return Response.json({ error: "Prioridade de SLA inválida." }, { status: 400 });
    if ((payload.actionMinutes !== null && payload.actionMinutes !== undefined && payload.actionMinutes !== "") && !actionMinutes)
      return Response.json({ error: "Informe um SLA de acionamento válido." }, { status: 400 });
    if ((payload.attendanceMinutes !== null && payload.attendanceMinutes !== undefined && payload.attendanceMinutes !== "") && !attendanceMinutes)
      return Response.json({ error: "Informe um SLA de atendimento válido." }, { status: 400 });
    if (!targetMinutes)
      return Response.json({ error: "Informe um SLA de resolução válido." }, { status: 400 });
    if (await hasDuplicateScope(companyId, priority, serviceType))
      return Response.json({ error: "Já existe uma regra de SLA para esta combinação." }, { status: 409 });

    const [created] = await getDb()
      .insert(serviceCallSlaPolicies)
      .values({ companyId, priority, serviceType, actionMinutes, attendanceMinutes, targetMinutes, pausePending, active: true })
      .returning();
    return Response.json({ policy: created }, { status: 201 });
  } catch {
    return Response.json({ error: "Não foi possível criar a política de SLA." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;

  try {
    await ensureSlaTable();
    const payload = (await request.json()) as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json({ error: "Política de SLA inválida." }, { status: 400 });

    const companyId = cleanCompanyId(payload.companyId);
    const priority = payload.priority === null || payload.priority === "" ? null : cleanPriority(payload.priority);
    const serviceType = cleanServiceType(payload.serviceType);
    const actionMinutes = cleanMinutes(payload.actionMinutes, true);
    const attendanceMinutes = cleanMinutes(payload.attendanceMinutes, true);
    const targetMinutes = cleanMinutes(payload.targetMinutes);
    const pausePending = payload.pausePending !== false;
    const active = payload.active !== false;

    if (payload.priority && !priority)
      return Response.json({ error: "Prioridade de SLA inválida." }, { status: 400 });
    if ((payload.actionMinutes !== null && payload.actionMinutes !== undefined && payload.actionMinutes !== "") && !actionMinutes)
      return Response.json({ error: "Informe um SLA de acionamento válido." }, { status: 400 });
    if ((payload.attendanceMinutes !== null && payload.attendanceMinutes !== undefined && payload.attendanceMinutes !== "") && !attendanceMinutes)
      return Response.json({ error: "Informe um SLA de atendimento válido." }, { status: 400 });
    if (!targetMinutes)
      return Response.json({ error: "Informe um SLA de resolução válido." }, { status: 400 });
    if (await hasDuplicateScope(companyId, priority, serviceType, id))
      return Response.json({ error: "Já existe outra regra de SLA para esta combinação." }, { status: 409 });

    const [updated] = await getDb()
      .update(serviceCallSlaPolicies)
      .set({
        companyId,
        priority,
        serviceType,
        actionMinutes,
        attendanceMinutes,
        targetMinutes,
        pausePending,
        active,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(serviceCallSlaPolicies.id, id))
      .returning();

    if (!updated)
      return Response.json({ error: "Política de SLA não encontrada." }, { status: 404 });
    return Response.json({ policy: updated });
  } catch {
    return Response.json({ error: "Não foi possível atualizar a política de SLA." }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const denied = await requirePermission("sales");
  if (denied) return denied;

  try {
    await ensureSlaTable();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0)
      return Response.json({ error: "Política de SLA inválida." }, { status: 400 });
    const [deleted] = await getDb()
      .delete(serviceCallSlaPolicies)
      .where(eq(serviceCallSlaPolicies.id, id))
      .returning({ id: serviceCallSlaPolicies.id });
    if (!deleted)
      return Response.json({ error: "Política de SLA não encontrada." }, { status: 404 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Não foi possível remover a política de SLA." }, { status: 503 });
  }
}
