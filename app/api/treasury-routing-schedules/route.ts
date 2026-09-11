import { getChatGPTUser } from "@/app/chatgpt-auth";
import { todaySaoPaulo } from "@/app/financial-ledger";
import { listTreasuryAlertUsers } from "@/app/treasury-alert-assignment";
import {
  listTreasuryRoutingProfiles,
  listTreasuryRoutingScheduleAudit,
  listTreasuryRoutingSchedules,
  saveTreasuryRoutingSchedule,
  treasuryScheduleTypes,
  type TreasuryScheduleType,
} from "@/app/treasury-routing-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const allowedTypes = new Set<string>(treasuryScheduleTypes);

function parseNullableUserId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

async function validatePayload(payload: Record<string, unknown>, existingId?: number | null) {
  const users = await listTreasuryAlertUsers();
  const userId = Number(payload.userId);
  const scheduleType = String(payload.scheduleType ?? "") as TreasuryScheduleType;
  const startDate = String(payload.startDate ?? "").trim();
  const endDate = String(payload.endDate ?? "").trim();
  const startTimeRaw = String(payload.startTime ?? "").trim();
  const endTimeRaw = String(payload.endTime ?? "").trim();
  const coverageUserId = parseNullableUserId(payload.coverageUserId);
  const notes = String(payload.notes ?? "").trim().slice(0, 1000) || null;
  const active = payload.active !== false;

  if (!Number.isInteger(userId) || userId <= 0 || !users.some((user) => user.id === userId)) throw new Error("Responsável da escala inválido ou sem acesso à Tesouraria.");
  if (!allowedTypes.has(scheduleType)) throw new Error("Tipo de escala inválido.");
  if (!datePattern.test(startDate) || !datePattern.test(endDate) || endDate < startDate) throw new Error("Período da escala inválido.");
  if (Number.isNaN(coverageUserId)) throw new Error("Usuário de cobertura inválido.");
  if (coverageUserId !== null && coverageUserId === userId) throw new Error("A cobertura temporária deve ser outra pessoa.");
  if (coverageUserId !== null && !users.some((user) => user.id === coverageUserId)) throw new Error("Usuário de cobertura sem acesso ativo à Tesouraria.");

  let startTime: string | null = null;
  let endTime: string | null = null;
  if (scheduleType === "reduced_hours") {
    if (!timePattern.test(startTimeRaw) || !timePattern.test(endTimeRaw)) throw new Error("Horário reduzido exige início e fim no formato HH:MM.");
    if (startTimeRaw === endTimeRaw) throw new Error("O início e o fim do horário reduzido não podem ser iguais.");
    startTime = startTimeRaw;
    endTime = endTimeRaw;
  }

  return { id: existingId ?? null, users, userId, scheduleType, startDate, endDate, startTime, endTime, coverageUserId, notes, active };
}

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const users = await listTreasuryAlertUsers();
    const [schedules, profiles, audit] = await Promise.all([
      listTreasuryRoutingSchedules(),
      listTreasuryRoutingProfiles(users),
      listTreasuryRoutingScheduleAudit(100),
    ]);
    const userMap = new Map(users.map((user) => [user.id, user]));
    const effectiveScheduleIds = new Set(profiles.map((profile) => profile.activeSchedule?.id).filter((id): id is number => Boolean(id)));
    const today = todaySaoPaulo();
    const enriched = schedules.map((row) => ({
      ...row,
      userName: userMap.get(row.userId)?.name ?? `Usuário #${row.userId}`,
      userEmail: userMap.get(row.userId)?.email ?? "",
      coverageName: row.coverageUserId ? userMap.get(row.coverageUserId)?.name ?? `Usuário #${row.coverageUserId}` : null,
      coverageEmail: row.coverageUserId ? userMap.get(row.coverageUserId)?.email ?? null : null,
      status: !row.active ? "cancelled" : row.endDate < today ? "past" : row.startDate > today ? "upcoming" : "current",
      affectingNow: effectiveScheduleIds.has(row.id),
    }));
    return Response.json({
      currentUser: { email: auth.email },
      today,
      users,
      schedules: enriched,
      audit,
      summary: {
        totalActive: enriched.filter((row) => row.active && row.endDate >= today).length,
        affectingNow: enriched.filter((row) => row.affectingNow).length,
        upcoming: enriched.filter((row) => row.status === "upcoming").length,
        withCoverage: enriched.filter((row) => row.active && row.coverageUserId && row.endDate >= today).length,
        reducedHours: enriched.filter((row) => row.active && row.scheduleType === "reduced_hours" && row.endDate >= today).length,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as escalas da Tesouraria." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const parsed = await validatePayload(payload);
    const schedule = await saveTreasuryRoutingSchedule({
      userId: parsed.userId,
      scheduleType: parsed.scheduleType,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      coverageUserId: parsed.coverageUserId,
      notes: parsed.notes,
      active: parsed.active,
      performedBy: auth.email,
    });
    return Response.json({ schedule }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível criar a escala." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Escala inválida." }, { status: 400 });
    const parsed = await validatePayload(payload, id);
    const schedule = await saveTreasuryRoutingSchedule({
      id,
      userId: parsed.userId,
      scheduleType: parsed.scheduleType,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      coverageUserId: parsed.coverageUserId,
      notes: parsed.notes,
      active: parsed.active,
      performedBy: auth.email,
    });
    return Response.json({ schedule });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar a escala." }, { status: 400 });
  }
}
