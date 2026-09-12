import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { requireServiceCostAccess } from "@/app/service-technician-access";
import { ensureServiceFieldExecutionTables } from "@/app/service-field-execution-runtime";
import { getDb } from "@/db";
import { serviceCallExpenses } from "@/db/schema";
import { serviceCallTechnicians, serviceTechnicianAudit, serviceTechnicians } from "@/db/service-technician-schema";
import { serviceFieldEvidences, serviceFieldEvents, serviceFieldExecutions, serviceFieldExpenseLinks } from "@/db/service-field-execution-schema";

const clean = (value: unknown) => String(value ?? "").trim();
const transitions: Record<string, string[]> = {
  assigned: ["invited", "cancelled"], invited: ["accepted", "declined", "cancelled"],
  accepted: ["en_route", "cancelled"], en_route: ["arrived", "cancelled"], arrived: ["checked_in", "cancelled"],
  checked_in: ["in_progress", "cancelled"], in_progress: ["finished", "return_required"],
  return_required: ["accepted", "cancelled"], finished: ["checked_out", "closed"], checked_out: ["closed"],
  declined: ["invited", "cancelled"], closed: [], cancelled: [],
};
const timestampColumn: Record<string, keyof typeof serviceFieldExecutions.$inferInsert> = {
  invited: "invitedAt", accepted: "acceptedAt", declined: "declinedAt", en_route: "departedAt", arrived: "arrivedAt",
  checked_in: "checkedInAt", in_progress: "startedAt", finished: "finishedAt", checked_out: "checkedOutAt", closed: "closedAt",
};

async function load(serviceCallId: number) {
  const db = getDb();
  const [assignments, technicians, executions, events, evidences, links, expenses] = await Promise.all([
    db.select().from(serviceCallTechnicians).where(eq(serviceCallTechnicians.serviceCallId, serviceCallId)),
    db.select().from(serviceTechnicians), db.select().from(serviceFieldExecutions).where(eq(serviceFieldExecutions.serviceCallId, serviceCallId)),
    db.select().from(serviceFieldEvents).where(eq(serviceFieldEvents.serviceCallId, serviceCallId)),
    db.select().from(serviceFieldEvidences).where(eq(serviceFieldEvidences.serviceCallId, serviceCallId)),
    db.select().from(serviceFieldExpenseLinks), db.select().from(serviceCallExpenses).where(eq(serviceCallExpenses.serviceCallId, serviceCallId)),
  ]);
  const techById = new Map(technicians.map((item) => [item.id, item]));
  const linkByExpense = new Map(links.map((item) => [item.expenseId, item.executionId]));
  return { executions: executions.map((execution) => ({ ...execution, technicianName: techById.get(execution.technicianId)?.name ?? "Técnico", assignment: assignments.find((a) => a.id === execution.assignmentId), events: events.filter((e) => e.executionId === execution.id).sort((a,b) => a.occurredAt.localeCompare(b.occurredAt)), evidences: evidences.filter((e) => e.executionId === execution.id), expenses: expenses.filter((e) => linkByExpense.get(e.id) === execution.id) })) };
}

export async function GET(request: Request) {
  const denied = await requireServiceCostAccess(); if (denied) return denied;
  try { await ensureServiceFieldExecutionTables(); const id = Number(new URL(request.url).searchParams.get("serviceCallId")); if (!id) return Response.json({ error: "OS inválida." }, { status: 400 }); return Response.json(await load(id)); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha ao carregar a jornada." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const denied = await requireServiceCostAccess(); if (denied) return denied;
  const auth = await getChatGPTUser(); if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureServiceFieldExecutionTables(); const payload = await request.json() as Record<string, unknown>; const db = getDb();
    const action = clean(payload.action); const assignmentId = Number(payload.assignmentId); const executionId = Number(payload.executionId);
    if (action === "create") {
      const [assignment] = await db.select().from(serviceCallTechnicians).where(eq(serviceCallTechnicians.id, assignmentId)).limit(1);
      if (!assignment || assignment.assignmentStatus === "cancelled") return Response.json({ error: "Vínculo técnico inválido." }, { status: 404 });
      const [existing] = await db.select().from(serviceFieldExecutions).where(eq(serviceFieldExecutions.assignmentId, assignmentId)).limit(1);
      if (existing) return Response.json({ execution: existing });
      const [row] = await db.insert(serviceFieldExecutions).values({ assignmentId, serviceCallId: assignment.serviceCallId, technicianId: assignment.technicianId }).returning();
      return Response.json({ execution: row }, { status: 201 });
    }
    const [execution] = await db.select().from(serviceFieldExecutions).where(eq(serviceFieldExecutions.id, executionId)).limit(1);
    if (!execution) return Response.json({ error: "Jornada não encontrada." }, { status: 404 });
    const now = new Date().toISOString();
    if (action === "transition") {
      const next = clean(payload.status); if (!(transitions[execution.status] ?? []).includes(next)) return Response.json({ error: `Transição de ${execution.status} para ${next} não permitida.` }, { status: 409 });
      if (next === "declined" && !clean(payload.note)) return Response.json({ error: "Informe o motivo da recusa." }, { status: 400 });
      if (next === "return_required" && !clean(payload.note)) return Response.json({ error: "Informe o motivo e a necessidade da segunda visita." }, { status: 400 });
      const occurredAt = clean(payload.occurredAt) ? new Date(clean(payload.occurredAt)).toISOString() : now;
      const changes: Record<string, unknown> = { status: next, updatedAt: now };
      const column = timestampColumn[next]; if (column) changes[column] = occurredAt;
      if (next === "accepted" && clean(payload.expectedArrivalAt)) changes.expectedArrivalAt = new Date(clean(payload.expectedArrivalAt)).toISOString();
      if (next === "declined") changes.declineReason = clean(payload.note); if (next === "return_required") changes.returnReason = clean(payload.note); if (next === "finished") changes.technicianReport = clean(payload.note) || null;
      const lat = Number(payload.latitude), lng = Number(payload.longitude); if (next === "checked_in" && Number.isFinite(lat) && Number.isFinite(lng)) { changes.checkInLatitude = lat; changes.checkInLongitude = lng; } if (next === "checked_out" && Number.isFinite(lat) && Number.isFinite(lng)) { changes.checkOutLatitude = lat; changes.checkOutLongitude = lng; }
      await db.update(serviceFieldExecutions).set(changes).where(eq(serviceFieldExecutions.id, execution.id));
      await db.insert(serviceFieldEvents).values({ executionId: execution.id, serviceCallId: execution.serviceCallId, technicianId: execution.technicianId, eventType: next, occurredAt, latitude: Number.isFinite(lat) ? lat : null, longitude: Number.isFinite(lng) ? lng : null, note: clean(payload.note) || null, performedBy: auth.email });
      const assignmentStatus = next === "invited" ? "invited" : next === "accepted" ? "accepted" : next === "declined" ? "declined" : ["closed","cancelled"].includes(next) ? next : "in_progress";
      await db.update(serviceCallTechnicians).set({ assignmentStatus, updatedAt: now }).where(eq(serviceCallTechnicians.id, execution.assignmentId));
      await db.insert(serviceTechnicianAudit).values({ technicianId: execution.technicianId, assignmentId: execution.assignmentId, serviceCallId: execution.serviceCallId, action: `field_${next}`, performedBy: auth.email, note: clean(payload.note) || null });
      return Response.json(await load(execution.serviceCallId));
    }
    if (action === "evidence") {
      const title = clean(payload.title); if (!title) return Response.json({ error: "Informe o título da evidência." }, { status: 400 });
      await db.insert(serviceFieldEvidences).values({ executionId, serviceCallId: execution.serviceCallId, evidenceType: clean(payload.evidenceType) || "photo", title, description: clean(payload.description) || null, url: clean(payload.url) || null, capturedAt: now, uploadedBy: auth.email });
      return Response.json(await load(execution.serviceCallId), { status: 201 });
    }
    if (action === "expense") {
      const value = Number(payload.amount); if (!clean(payload.description) || !Number.isFinite(value) || value <= 0) return Response.json({ error: "Informe descrição e valor válido." }, { status: 400 });
      const [expense] = await db.insert(serviceCallExpenses).values({ serviceCallId: execution.serviceCallId, category: clean(payload.category) || "outros", description: clean(payload.description), amount: value, expenseDate: now.slice(0,10) }).returning();
      await db.insert(serviceFieldExpenseLinks).values({ executionId, expenseId: expense.id });
      return Response.json(await load(execution.serviceCallId), { status: 201 });
    }
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Falha na jornada de campo." }, { status: 500 }); }
}
