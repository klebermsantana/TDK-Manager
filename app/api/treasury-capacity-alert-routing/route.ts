import { and, eq, isNull } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GET as synchronizeCapacityAlerts } from "@/app/api/treasury-capacity-alerts/route";
import { listTreasuryAlertUsers } from "@/app/treasury-alert-assignment";
import { ensureTreasuryCapacityAlertTables } from "@/app/treasury-capacity-alerts-runtime";
import { ensureTreasuryCapacityRoutingSettings } from "@/app/treasury-capacity-smart-routing-runtime";
import {
  ensureTreasuryRoutingUsers,
  treasuryRoutingDomainLabels,
  treasuryRoutingDomains,
  type TreasuryAvailability,
  type TreasuryRoutingDomain,
} from "@/app/treasury-routing-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { treasuryAlertOccurrences, treasuryClosingTasks } from "@/db/treasury-closing-schema";
import { treasuryCapacityRoutingSettings } from "@/db/treasury-capacity-routing-schema";
import {
  treasuryCapacityAlertAssignmentHistory,
  treasuryCapacityAlertAudit,
  treasuryCapacityAlertOccurrences,
  treasuryRoutingProfiles,
  treasuryRoutingSchedules,
  treasuryRoutingSkills,
} from "@/db/treasury-routing-schema";

type User = Awaited<ReturnType<typeof listTreasuryAlertUsers>>[number];
type SkillMap = Record<TreasuryRoutingDomain, number>;
type Candidate = {
  userId: number;
  name: string;
  email: string;
  role: string;
  availability: TreasuryAvailability;
  skillLevel: number;
  skillSummary: string;
  loadPoints: number;
  explicitCoverage: boolean;
  score: number;
  autoEligible: boolean;
  reason: string;
};
type Suggestion = Candidate & { confidence: "high" | "medium" };

function availabilityRank(value: TreasuryAvailability) {
  return value === "unavailable" ? 2 : value === "limited" ? 1 : 0;
}

function strongestAvailability(a: TreasuryAvailability, b: TreasuryAvailability): TreasuryAvailability {
  return availabilityRank(a) >= availabilityRank(b) ? a : b;
}

function availabilityForDate(
  profile: typeof treasuryRoutingProfiles.$inferSelect | undefined,
  schedules: Array<typeof treasuryRoutingSchedules.$inferSelect>,
  riskDate: string,
): TreasuryAvailability {
  let base = (profile?.availability ?? "available") as TreasuryAvailability;
  if (base !== "available" && profile?.availabilityUntil && riskDate > profile.availabilityUntil) base = "available";
  let scheduled: TreasuryAvailability = "available";
  for (const row of schedules) {
    if (!row.active || row.startDate > riskDate || row.endDate < riskDate) continue;
    const candidate: TreasuryAvailability = row.scheduleType === "reduced_hours" ? "limited" : "unavailable";
    scheduled = strongestAvailability(scheduled, candidate);
  }
  return strongestAvailability(base, scheduled);
}

function preventiveWeight(row: typeof treasuryCapacityAlertOccurrences.$inferSelect) {
  const severity = row.severity === "critical" ? 2.5 : row.severity === "high" ? 2 : 1.5;
  if (row.preparedAt) return 0.25;
  return severity + (row.preparationEscalatedAt ? 2 : 0);
}

function buildLoadMap(
  users: User[],
  executive: Array<typeof treasuryAlertOccurrences.$inferSelect>,
  tasks: Array<typeof treasuryClosingTasks.$inferSelect>,
  preventives: Array<typeof treasuryCapacityAlertOccurrences.$inferSelect>,
) {
  const result = new Map<number, number>(users.map((user) => [user.id, 0]));
  for (const row of executive) {
    if (row.status !== "active" || !row.assignedUserId) continue;
    const severity = row.severity === "critical" ? 4 : row.severity === "high" ? 3 : 2;
    const value = severity + (row.ackEscalatedAt || row.resolutionEscalatedAt ? 3 : 0) + (row.acknowledgedAt ? 0 : 1);
    result.set(row.assignedUserId, (result.get(row.assignedUserId) ?? 0) + value);
  }
  for (const row of tasks) {
    if (!row.sourceActive || row.status === "resolved" || !row.assignedUserId) continue;
    const priority = row.priority === "critical" ? 3 : row.priority === "high" ? 2 : 1;
    result.set(row.assignedUserId, (result.get(row.assignedUserId) ?? 0) + priority + (row.status === "in_progress" ? 1 : 0));
  }
  for (const row of preventives) {
    if (row.status !== "active" || !row.assignedUserId) continue;
    result.set(row.assignedUserId, (result.get(row.assignedUserId) ?? 0) + preventiveWeight(row));
  }
  return result;
}

function scheduleIdFromAlertKey(key: string) {
  const match = /^capacity:absence:(\d+)$/.exec(key);
  return match ? Number(match[1]) : null;
}

function candidateReason(args: {
  availability: TreasuryAvailability;
  skillSummary: string;
  loadPoints: number;
  explicitCoverage: boolean;
}) {
  const availability = args.availability === "available" ? "disponível" : "disponibilidade limitada";
  return `${availability}; ${args.skillSummary}; carga ponderada ${args.loadPoints.toFixed(1)}${args.explicitCoverage ? "; já indicado como cobertura em escala" : ""}.`;
}

function scoreCandidates(args: {
  occurrence: typeof treasuryCapacityAlertOccurrences.$inferSelect;
  users: User[];
  profiles: Array<typeof treasuryRoutingProfiles.$inferSelect>;
  skillsByUser: Map<number, SkillMap>;
  schedules: Array<typeof treasuryRoutingSchedules.$inferSelect>;
  loadMap: Map<number, number>;
  minimumSkillLevel: number;
}) {
  const profileByUser = new Map(args.profiles.map((row) => [row.userId, row]));
  const requiredDomain = (treasuryRoutingDomains as readonly string[]).includes(args.occurrence.domain ?? "")
    ? args.occurrence.domain as TreasuryRoutingDomain
    : null;
  const absenceScheduleId = scheduleIdFromAlertKey(args.occurrence.alertKey);
  const absenceSchedule = absenceScheduleId ? args.schedules.find((row) => row.id === absenceScheduleId) : null;
  const absentSkills = absenceSchedule ? args.skillsByUser.get(absenceSchedule.userId) : null;
  const coreAbsentDomains = absentSkills
    ? treasuryRoutingDomains.filter((domain) => Number(absentSkills[domain] ?? 0) >= 2)
    : [];

  const candidates: Candidate[] = [];
  for (const user of args.users) {
    if (absenceSchedule?.userId === user.id) continue;
    const userSchedules = args.schedules.filter((row) => row.userId === user.id);
    const availability = availabilityForDate(profileByUser.get(user.id), userSchedules, args.occurrence.riskDate);
    if (availability === "unavailable") continue;
    const skills = args.skillsByUser.get(user.id) ?? Object.fromEntries(treasuryRoutingDomains.map((domain) => [domain, 0])) as SkillMap;
    const explicitCoverage = args.schedules.some((row) => row.active && row.coverageUserId === user.id && row.startDate <= args.occurrence.riskDate && row.endDate >= args.occurrence.riskDate);
    const loadPoints = Number((args.loadMap.get(user.id) ?? 0).toFixed(1));
    const availabilityPenalty = availability === "limited" ? 3 : 0;
    const roleBonus = user.role === "admin" || user.role === "manager" ? -0.4 : 0;
    const coverageBonus = explicitCoverage ? -0.8 : 0;
    let skillPenalty = 0;
    let skillLevel = 0;
    let skillSummary = "competência geral";
    let autoEligible = false;

    if (requiredDomain) {
      skillLevel = Number(skills[requiredDomain] ?? 0);
      if (skillLevel <= 0) continue;
      skillPenalty = (3 - skillLevel) * 2;
      skillSummary = `${treasuryRoutingDomainLabels[requiredDomain]} nível ${skillLevel}`;
      autoEligible = skillLevel >= args.minimumSkillLevel;
    } else if (args.occurrence.alertType === "absence_without_coverage" && coreAbsentDomains.length) {
      const matched = coreAbsentDomains.filter((domain) => Number(skills[domain] ?? 0) >= 2);
      const ratio = matched.length / coreAbsentDomains.length;
      skillLevel = Math.max(...treasuryRoutingDomains.map((domain) => Number(skills[domain] ?? 0)));
      if (!matched.length || skillLevel <= 0) continue;
      skillPenalty = (1 - ratio) * 5 + (3 - skillLevel) * 0.5;
      skillSummary = `cobre ${matched.length}/${coreAbsentDomains.length} competência(s) principais do ausente`;
      autoEligible = skillLevel >= args.minimumSkillLevel && ratio >= 0.5;
    } else {
      skillLevel = Math.max(...treasuryRoutingDomains.map((domain) => Number(skills[domain] ?? 0)));
      if (skillLevel <= 0) continue;
      skillPenalty = (3 - skillLevel) * 1.5;
      skillSummary = `melhor competência nível ${skillLevel}`;
      autoEligible = skillLevel >= args.minimumSkillLevel;
    }

    const score = Number((loadPoints * 0.6 + availabilityPenalty + skillPenalty + roleBonus + coverageBonus).toFixed(2));
    candidates.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      availability,
      skillLevel,
      skillSummary,
      loadPoints,
      explicitCoverage,
      score,
      autoEligible,
      reason: candidateReason({ availability, skillSummary, loadPoints, explicitCoverage }),
    });
  }

  candidates.sort((a, b) => a.score - b.score || b.skillLevel - a.skillLevel || a.name.localeCompare(b.name));
  const first = candidates[0];
  if (!first) return { suggestion: null as Suggestion | null, alternatives: [] as Candidate[] };
  const second = candidates[1];
  const confidence: "high" | "medium" = first.autoEligible
    && first.availability === "available"
    && (!second || second.score - first.score >= 0.75)
    ? "high"
    : "medium";
  return {
    suggestion: { ...first, confidence },
    alternatives: candidates.slice(1, 4),
  };
}

async function assignSmart(args: {
  occurrence: typeof treasuryCapacityAlertOccurrences.$inferSelect;
  candidate: Suggestion;
  source: "smart_auto" | "smart_suggestion";
  performedBy: string;
}) {
  if (args.occurrence.assignedUserId) return args.occurrence;
  const db = getDb();
  const now = new Date().toISOString();
  const [updated] = await db.update(treasuryCapacityAlertOccurrences).set({
    assignedUserId: args.candidate.userId,
    assignedName: args.candidate.name,
    assignedEmail: args.candidate.email,
    assignedAt: now,
    assignmentSource: args.source,
    updatedAt: now,
  }).where(eq(treasuryCapacityAlertOccurrences.id, args.occurrence.id)).returning();
  await db.insert(treasuryCapacityAlertAssignmentHistory).values({
    occurrenceId: args.occurrence.id,
    userId: args.candidate.userId,
    assignedName: args.candidate.name,
    assignedEmail: args.candidate.email,
    assignmentSource: args.source,
    assignedBy: args.performedBy,
    assignedAt: now,
  });
  await db.insert(treasuryCapacityAlertAudit).values({
    occurrenceId: args.occurrence.id,
    action: args.source === "smart_auto" ? "smart_auto_assigned" : "smart_suggestion_applied",
    performedBy: args.performedBy,
    note: `Responsável definido pelo roteamento inteligente: ${args.candidate.name}. Critério: ${args.candidate.reason}`,
  });
  return updated;
}

async function buildRoutingState(applyAutomatic: boolean) {
  await ensureTreasuryCapacityAlertTables();
  await ensureTreasuryCapacityRoutingSettings();
  const sync = await synchronizeCapacityAlerts();
  if (!sync.ok) {
    const payload = await sync.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? "Não foi possível sincronizar os preventivos.");
  }

  const users = await listTreasuryAlertUsers();
  await ensureTreasuryRoutingUsers(users);
  const db = getDb();
  const [settings] = await db.select().from(treasuryCapacityRoutingSettings)
    .where(eq(treasuryCapacityRoutingSettings.id, 1)).limit(1);
  if (!settings) throw new Error("Configuração de roteamento preventivo não encontrada.");

  const [profiles, skillRows, schedules, executive, tasks, preventives] = await Promise.all([
    db.select().from(treasuryRoutingProfiles),
    db.select().from(treasuryRoutingSkills),
    db.select().from(treasuryRoutingSchedules),
    db.select().from(treasuryAlertOccurrences),
    db.select().from(treasuryClosingTasks),
    db.select().from(treasuryCapacityAlertOccurrences),
  ]);
  const skillsByUser = new Map<number, SkillMap>(users.map((user) => [
    user.id,
    Object.fromEntries(treasuryRoutingDomains.map((domain) => [domain, 0])) as SkillMap,
  ]));
  for (const row of skillRows) {
    if (!(treasuryRoutingDomains as readonly string[]).includes(row.domain)) continue;
    const skills = skillsByUser.get(row.userId);
    if (skills) skills[row.domain as TreasuryRoutingDomain] = Number(row.level);
  }

  const loadMap = buildLoadMap(users, executive, tasks, preventives);
  const activeRows = preventives
    .filter((row) => row.status === "active" && !row.preparedAt)
    .sort((a, b) => a.riskDate.localeCompare(b.riskDate) || (a.severity === "critical" ? -1 : 1));
  const items: any[] = [];
  let autoAssigned = 0;

  for (let row of activeRows) {
    const scored = scoreCandidates({
      occurrence: row,
      users,
      profiles,
      skillsByUser,
      schedules,
      loadMap,
      minimumSkillLevel: Number(settings.minimumSkillLevel),
    });
    if (applyAutomatic && settings.autoAssignmentEnabled && !row.assignedUserId && scored.suggestion?.confidence === "high") {
      row = await assignSmart({
        occurrence: row,
        candidate: scored.suggestion,
        source: "smart_auto",
        performedBy: "system",
      });
      loadMap.set(scored.suggestion.userId, (loadMap.get(scored.suggestion.userId) ?? 0) + preventiveWeight(row));
      autoAssigned += 1;
    }
    items.push({
      occurrenceId: row.id,
      title: row.title,
      detail: row.detail,
      severity: row.severity,
      alertType: row.alertType,
      riskDate: row.riskDate,
      domain: row.domain,
      preparationDueAt: row.preparationDueAt,
      preparationEscalatedAt: row.preparationEscalatedAt,
      assignedUserId: row.assignedUserId,
      assignedName: row.assignedName,
      assignedEmail: row.assignedEmail,
      assignmentSource: row.assignmentSource,
      suggestion: scored.suggestion,
      alternatives: scored.alternatives,
    });
  }

  return {
    settings,
    items,
    autoAssigned,
    summary: {
      activeUnprepared: items.length,
      assigned: items.filter((item) => item.assignedUserId).length,
      unassigned: items.filter((item) => !item.assignedUserId).length,
      highConfidence: items.filter((item) => !item.assignedUserId && item.suggestion?.confidence === "high").length,
      mediumConfidence: items.filter((item) => !item.assignedUserId && item.suggestion?.confidence === "medium").length,
      noEligibleCandidate: items.filter((item) => !item.assignedUserId && !item.suggestion).length,
      autoAssigned,
    },
  };
}

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    const state = await buildRoutingState(true);
    return Response.json({ generatedAt: new Date().toISOString(), ...state });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível calcular o roteamento preventivo." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryCapacityRoutingSettings();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "settings") {
      const minimumSkillLevel = Number(payload.minimumSkillLevel);
      if (![1, 2, 3].includes(minimumSkillLevel)) return Response.json({ error: "Nível mínimo deve ser 1, 2 ou 3." }, { status: 400 });
      const [settings] = await db.update(treasuryCapacityRoutingSettings).set({
        autoAssignmentEnabled: Boolean(payload.autoAssignmentEnabled),
        minimumSkillLevel,
        updatedBy: auth.email,
        updatedAt: now,
      }).where(eq(treasuryCapacityRoutingSettings.id, 1)).returning();
      return Response.json({ settings });
    }

    if (action === "apply_suggestion") {
      const occurrenceId = Number(payload.occurrenceId);
      if (!Number.isInteger(occurrenceId) || occurrenceId <= 0) return Response.json({ error: "Ocorrência inválida." }, { status: 400 });
      const state = await buildRoutingState(false);
      const item = state.items.find((row) => row.occurrenceId === occurrenceId);
      if (!item) return Response.json({ error: "Preventivo ativo e não preparado não encontrado." }, { status: 404 });
      if (item.assignedUserId) return Response.json({ error: "Este preventivo já possui responsável. A atribuição existente foi preservada." }, { status: 409 });
      if (!item.suggestion) return Response.json({ error: "Nenhum candidato elegível foi encontrado para este preventivo." }, { status: 409 });
      const [occurrence] = await db.select().from(treasuryCapacityAlertOccurrences)
        .where(eq(treasuryCapacityAlertOccurrences.id, occurrenceId)).limit(1);
      if (!occurrence || occurrence.status !== "active" || occurrence.preparedAt) return Response.json({ error: "Preventivo não está mais disponível para roteamento." }, { status: 409 });
      const updated = await assignSmart({
        occurrence,
        candidate: item.suggestion,
        source: "smart_suggestion",
        performedBy: auth.email,
      });
      return Response.json({ occurrence: updated, suggestion: item.suggestion });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar o roteamento preventivo." }, { status: 500 });
  }
}
