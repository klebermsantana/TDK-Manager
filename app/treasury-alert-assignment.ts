import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  treasuryAlertAssignmentHistory,
  treasuryAlertAssignmentRules,
  treasuryAlertOccurrenceAudit,
  treasuryAlertOccurrences,
  treasuryClosingTasks,
} from "@/db/treasury-closing-schema";
import {
  ensureTreasuryRoutingUsers,
  isTreasuryRoutingEligible,
  listTreasuryRoutingProfiles,
  routingDomainForAlertType,
} from "@/app/treasury-routing-runtime";

type AssignmentSource = "manual" | "take" | "escalation_rule";
const ownerEmail = "kleber.santana@tecnodesk.com.br";

export function hasTreasuryAccessCandidate(user: typeof users.$inferSelect) {
  if (!user.active) return false;
  if (user.email.toLowerCase() === ownerEmail || user.role === "admin") return true;
  try {
    const permissions = JSON.parse(user.permissions) as string[];
    return permissions.includes("receivables") && permissions.includes("payables");
  } catch {
    return false;
  }
}

export async function listTreasuryAlertUsers() {
  const rows = await getDb().select().from(users).orderBy(asc(users.name));
  return rows.filter(hasTreasuryAccessCandidate).map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  }));
}

export async function listTreasuryAlertAssignmentRules() {
  return getDb().select().from(treasuryAlertAssignmentRules).orderBy(asc(treasuryAlertAssignmentRules.alertType));
}

async function closeOpenAssignmentHistory(occurrenceId: number, performedBy: string, at: string) {
  await getDb().update(treasuryAlertAssignmentHistory).set({
    unassignedAt: at,
    unassignedBy: performedBy,
  }).where(and(
    eq(treasuryAlertAssignmentHistory.occurrenceId, occurrenceId),
    isNull(treasuryAlertAssignmentHistory.unassignedAt),
  ));
}

export async function assignTreasuryAlertOccurrence(args: {
  occurrenceId: number;
  userId: number | null;
  source: AssignmentSource;
  performedBy: string;
  note?: string | null;
}) {
  const db = getDb();
  const [occurrence] = await db.select().from(treasuryAlertOccurrences)
    .where(eq(treasuryAlertOccurrences.id, args.occurrenceId)).limit(1);
  if (!occurrence) throw new Error("Ocorrência de alerta não encontrada.");
  if (occurrence.status !== "active") throw new Error("Somente alertas ativos podem ter o responsável alterado.");

  const now = new Date().toISOString();
  if (args.userId === null) {
    await closeOpenAssignmentHistory(occurrence.id, args.performedBy, now);
    const [updated] = await db.update(treasuryAlertOccurrences).set({
      assignedUserId: null,
      assignedName: null,
      assignedEmail: null,
      assignedAt: null,
      assignmentSource: null,
      updatedAt: now,
    }).where(eq(treasuryAlertOccurrences.id, occurrence.id)).returning();
    await db.insert(treasuryAlertOccurrenceAudit).values({
      occurrenceId: occurrence.id,
      action: "unassigned",
      performedBy: args.performedBy,
      note: args.note ?? "Responsável removido do alerta.",
    });
    return updated;
  }

  const [user] = await db.select().from(users).where(eq(users.id, args.userId)).limit(1);
  if (!user || !hasTreasuryAccessCandidate(user)) {
    throw new Error("O usuário selecionado não possui acesso ativo à Tesouraria.");
  }
  if (occurrence.assignedUserId === user.id) return occurrence;

  await closeOpenAssignmentHistory(occurrence.id, args.performedBy, now);
  const [updated] = await db.update(treasuryAlertOccurrences).set({
    assignedUserId: user.id,
    assignedName: user.name,
    assignedEmail: user.email,
    assignedAt: now,
    assignmentSource: args.source,
    updatedAt: now,
  }).where(eq(treasuryAlertOccurrences.id, occurrence.id)).returning();

  await db.insert(treasuryAlertAssignmentHistory).values({
    occurrenceId: occurrence.id,
    userId: user.id,
    assignedName: user.name,
    assignedEmail: user.email,
    assignmentSource: args.source,
    assignedBy: args.performedBy,
    assignedAt: now,
  });
  await db.insert(treasuryAlertOccurrenceAudit).values({
    occurrenceId: occurrence.id,
    action: args.source === "escalation_rule" ? "auto_assigned" : args.source === "take" ? "taken" : "assigned",
    performedBy: args.performedBy,
    note: args.note ?? `${user.name} <${user.email}> definido como responsável (${args.source}).`,
  });
  return updated;
}

export async function assignDefaultOnEscalation(occurrence: typeof treasuryAlertOccurrences.$inferSelect) {
  if (occurrence.status !== "active" || occurrence.assignedUserId) return occurrence;
  if (!occurrence.ackEscalatedAt && !occurrence.resolutionEscalatedAt) return occurrence;
  const db = getDb();
  const [rule] = await db.select().from(treasuryAlertAssignmentRules)
    .where(eq(treasuryAlertAssignmentRules.alertType, occurrence.alertType)).limit(1);
  if (!rule?.active || !rule.assignedUserId) return occurrence;

  const domain = routingDomainForAlertType(occurrence.alertType);
  const eligibleConfigured = await isTreasuryRoutingEligible(rule.assignedUserId, domain);
  let targetUserId: number | null = eligibleConfigured ? rule.assignedUserId : null;
  let fallbackNote = "";

  if (!targetUserId) {
    const candidates = await listTreasuryAlertUsers();
    await ensureTreasuryRoutingUsers(candidates);
    const profiles = await listTreasuryRoutingProfiles(candidates);
    const [activeAlerts, activeTasks] = await Promise.all([
      db.select().from(treasuryAlertOccurrences),
      db.select().from(treasuryClosingTasks),
    ]);
    const loadByUser = new Map<number, number>();
    for (const user of candidates) loadByUser.set(user.id, 0);
    for (const row of activeAlerts.filter((item) => item.status === "active" && item.assignedUserId)) {
      loadByUser.set(row.assignedUserId!, (loadByUser.get(row.assignedUserId!) ?? 0) + (row.severity === "critical" ? 4 : row.severity === "high" ? 3 : 2));
    }
    for (const row of activeTasks.filter((item) => item.sourceActive && item.status !== "resolved" && item.assignedUserId)) {
      loadByUser.set(row.assignedUserId!, (loadByUser.get(row.assignedUserId!) ?? 0) + (row.priority === "critical" ? 3 : row.priority === "high" ? 2 : 1));
    }
    const routed = profiles
      .filter((profile) => profile.availability !== "unavailable" && Number(profile.skills[domain] ?? 0) > 0)
      .sort((a, b) => {
        const availabilityA = a.availability === "available" ? 0 : 1;
        const availabilityB = b.availability === "available" ? 0 : 1;
        return availabilityA - availabilityB
          || Number(b.skills[domain] ?? 0) - Number(a.skills[domain] ?? 0)
          || (loadByUser.get(a.id) ?? 0) - (loadByUser.get(b.id) ?? 0)
          || a.name.localeCompare(b.name);
      });
    targetUserId = routed[0]?.id ?? null;
    if (targetUserId) fallbackNote = " O responsável padrão estava indisponível ou sem competência para o tipo do alerta; foi usado o melhor substituto elegível pela matriz de roteamento.";
  }

  if (!targetUserId) return occurrence;
  try {
    return await assignTreasuryAlertOccurrence({
      occurrenceId: occurrence.id,
      userId: targetUserId,
      source: "escalation_rule",
      performedBy: "system",
      note: `Responsável atribuído automaticamente após escalonamento, respeitando competência e disponibilidade.${fallbackNote}`,
    });
  } catch {
    return occurrence;
  }
}

export async function closeAssignmentAtResolution(occurrenceId: number, performedBy: string, at: string) {
  await closeOpenAssignmentHistory(occurrenceId, performedBy, at);
}

export async function saveTreasuryAlertAssignmentRule(args: {
  alertType: string;
  userId: number | null;
  active: boolean;
  performedBy: string;
}) {
  const allowed = new Set(["negative_forecast", "critical_task", "reconciliation", "closing_overdue"]);
  if (!allowed.has(args.alertType)) throw new Error("Tipo de alerta inválido.");
  const db = getDb();
  let user: typeof users.$inferSelect | null = null;
  if (args.userId !== null) {
    const [candidate] = await db.select().from(users).where(eq(users.id, args.userId)).limit(1);
    if (!candidate || !hasTreasuryAccessCandidate(candidate)) throw new Error("O usuário selecionado não possui acesso ativo à Tesouraria.");
    user = candidate;
  }
  const now = new Date().toISOString();
  const [existing] = await db.select().from(treasuryAlertAssignmentRules)
    .where(eq(treasuryAlertAssignmentRules.alertType, args.alertType)).limit(1);
  if (existing) {
    const [updated] = await db.update(treasuryAlertAssignmentRules).set({
      assignedUserId: user?.id ?? null,
      assignedName: user?.name ?? null,
      assignedEmail: user?.email ?? null,
      active: args.active,
      updatedBy: args.performedBy,
      updatedAt: now,
    }).where(eq(treasuryAlertAssignmentRules.id, existing.id)).returning();
    return updated;
  }
  const [created] = await db.insert(treasuryAlertAssignmentRules).values({
    alertType: args.alertType,
    assignedUserId: user?.id ?? null,
    assignedName: user?.name ?? null,
    assignedEmail: user?.email ?? null,
    active: args.active,
    updatedBy: args.performedBy,
    updatedAt: now,
  }).returning();
  return created;
}

export async function listTreasuryAlertAssignmentHistory(limit = 200) {
  return getDb().select().from(treasuryAlertAssignmentHistory)
    .orderBy(desc(treasuryAlertAssignmentHistory.assignedAt), desc(treasuryAlertAssignmentHistory.id))
    .limit(limit);
}
