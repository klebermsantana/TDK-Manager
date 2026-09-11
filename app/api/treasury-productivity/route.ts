import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GET as getExecutiveAlerts } from "@/app/api/treasury-executive-alerts/route";
import { ensureTreasuryAlertSettings } from "@/app/treasury-executive-alerts-runtime";
import { listTreasuryAlertUsers } from "@/app/treasury-alert-assignment";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import {
  treasuryAlertAssignmentHistory,
  treasuryAlertOccurrences,
  treasuryClosingTaskAudit,
  treasuryClosingTasks,
} from "@/db/treasury-closing-schema";

type Period = "30" | "90" | "180" | "all";
type PersonAccumulator = {
  id: number;
  name: string;
  email: string;
  role: string;
  activeAlerts: number;
  activeTasks: number;
  escalatedActive: number;
  criticalActive: number;
  alertIds: Set<number>;
  taskIds: Set<number>;
  taskActions: number;
  acknowledgements: number;
  normalizations: number;
  ackBreaches: number;
  resolutionBreaches: number;
  ackDurations: number[];
  resolutionDurations: number[];
  responsibilityDurations: number[];
};
type Activity = {
  email: string;
  at: string;
  kind: "assignment" | "acknowledgement" | "normalization" | "sla_breach" | "task";
  title: string;
  detail: string;
};

const minuteMs = 60000;
const dayMs = 86400000;
const average = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
const minutesBetween = (start: string, end: string) => Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / minuteMs);
const maxIso = (a: string, b: string) => a > b ? a : b;
const minIso = (a: string, b: string) => a < b ? a : b;

function parsePeriod(request: Request) {
  const raw = new URL(request.url).searchParams.get("period") ?? "90";
  return new Set(["30", "90", "180", "all"]).has(raw) ? raw as Period : "90";
}

function startFor(period: Period, now: string) {
  if (period === "all") return null;
  return new Date(new Date(now).getTime() - Number(period) * dayMs).toISOString();
}

function inPeriod(value: string | null | undefined, startAt: string | null, now: string) {
  if (!value) return false;
  return (!startAt || value >= startAt) && value <= now;
}

function intervalOverlaps(start: string, end: string | null, startAt: string | null, now: string) {
  const effectiveEnd = end ?? now;
  return effectiveEnd >= (startAt ?? "0000") && start <= now;
}

function overlapMinutes(start: string, end: string | null, startAt: string | null, now: string) {
  const effectiveStart = startAt ? maxIso(start, startAt) : start;
  const effectiveEnd = minIso(end ?? now, now);
  return effectiveEnd >= effectiveStart ? minutesBetween(effectiveStart, effectiveEnd) : 0;
}

function taskActionLabel(action: string, toStatus: string | null) {
  if (action === "take") return "Pendência assumida";
  if (action === "comment") return "Observação registrada";
  if (action === "status") {
    if (toStatus === "in_progress") return "Pendência em andamento";
    if (toStatus === "waiting") return "Pendência aguardando";
    if (toStatus === "open") return "Pendência reaberta para trabalho";
    return "Status da pendência atualizado";
  }
  return "Pendência movimentada";
}

export async function GET(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureTreasuryAlertSettings();
    const synchronization = await getExecutiveAlerts();
    if (!synchronization.ok) {
      const payload = await synchronization.json().catch(() => ({})) as { error?: string };
      return Response.json({ error: payload.error ?? "Não foi possível sincronizar a Tesouraria." }, { status: synchronization.status });
    }

    const now = new Date().toISOString();
    const period = parsePeriod(request);
    const startAt = startFor(period, now);
    const db = getDb();
    const [users, occurrences, assignmentHistory, tasks, taskAudit] = await Promise.all([
      listTreasuryAlertUsers(),
      db.select().from(treasuryAlertOccurrences),
      db.select().from(treasuryAlertAssignmentHistory),
      db.select().from(treasuryClosingTasks),
      db.select().from(treasuryClosingTaskAudit),
    ]);

    const people = new Map<string, PersonAccumulator>();
    for (const user of users) {
      people.set(user.email.toLowerCase(), {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        activeAlerts: 0,
        activeTasks: 0,
        escalatedActive: 0,
        criticalActive: 0,
        alertIds: new Set(),
        taskIds: new Set(),
        taskActions: 0,
        acknowledgements: 0,
        normalizations: 0,
        ackBreaches: 0,
        resolutionBreaches: 0,
        ackDurations: [],
        resolutionDurations: [],
        responsibilityDurations: [],
      });
    }

    const historyByOccurrence = new Map<number, typeof assignmentHistory>();
    for (const row of assignmentHistory) {
      const list = historyByOccurrence.get(row.occurrenceId) ?? [];
      list.push(row);
      historyByOccurrence.set(row.occurrenceId, list);
      const person = people.get(row.assignedEmail.toLowerCase());
      if (!person || !intervalOverlaps(row.assignedAt, row.unassignedAt, startAt, now)) continue;
      person.alertIds.add(row.occurrenceId);
      const duration = overlapMinutes(row.assignedAt, row.unassignedAt, startAt, now);
      if (duration >= 0) person.responsibilityDurations.push(duration);
    }

    function responsibleAt(occurrence: typeof treasuryAlertOccurrences.$inferSelect, at: string) {
      const rows = historyByOccurrence.get(occurrence.id) ?? [];
      const matched = rows
        .filter((row) => row.assignedAt <= at && (!row.unassignedAt || row.unassignedAt >= at))
        .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))[0];
      if (matched) return { email: matched.assignedEmail, assignedAt: matched.assignedAt };
      if (occurrence.assignedEmail && occurrence.assignedAt && occurrence.assignedAt <= at) {
        return { email: occurrence.assignedEmail, assignedAt: occurrence.assignedAt };
      }
      return null;
    }

    const activities: Activity[] = [];
    const occurrenceMap = new Map(occurrences.map((row) => [row.id, row]));

    for (const occurrence of occurrences) {
      if (occurrence.status === "active" && occurrence.assignedEmail) {
        const person = people.get(occurrence.assignedEmail.toLowerCase());
        if (person) {
          person.activeAlerts += 1;
          if (occurrence.ackEscalatedAt || occurrence.resolutionEscalatedAt) person.escalatedActive += 1;
          if (occurrence.severity === "critical") person.criticalActive += 1;
        }
      }

      if (inPeriod(occurrence.acknowledgedAt, startAt, now)) {
        const owner = responsibleAt(occurrence, occurrence.acknowledgedAt!);
        const person = owner ? people.get(owner.email.toLowerCase()) : null;
        if (person) {
          person.acknowledgements += 1;
          person.ackDurations.push(minutesBetween(maxIso(owner!.assignedAt, occurrence.firstSeenAt), occurrence.acknowledgedAt!));
          activities.push({
            email: person.email,
            at: occurrence.acknowledgedAt!,
            kind: "acknowledgement",
            title: "Alerta reconhecido sob responsabilidade",
            detail: `${occurrence.title} · ciência por ${occurrence.acknowledgedBy ?? "usuário não identificado"}.`,
          });
        }
      }

      if (occurrence.resolutionReason === "condition_cleared" && inPeriod(occurrence.resolvedAt, startAt, now)) {
        const owner = responsibleAt(occurrence, occurrence.resolvedAt!);
        const person = owner ? people.get(owner.email.toLowerCase()) : null;
        if (person) {
          person.normalizations += 1;
          const operationalStart = maxIso(owner!.assignedAt, occurrence.acknowledgedAt ?? occurrence.firstSeenAt);
          person.resolutionDurations.push(minutesBetween(operationalStart, occurrence.resolvedAt!));
          activities.push({
            email: person.email,
            at: occurrence.resolvedAt!,
            kind: "normalization",
            title: "Alerta normalizado sob responsabilidade",
            detail: occurrence.title,
          });
        }
      }

      if (inPeriod(occurrence.ackEscalatedAt, startAt, now)) {
        const owner = responsibleAt(occurrence, occurrence.ackEscalatedAt!);
        const person = owner ? people.get(owner.email.toLowerCase()) : null;
        if (person) {
          person.ackBreaches += 1;
          activities.push({ email: person.email, at: occurrence.ackEscalatedAt!, kind: "sla_breach", title: "SLA de ciência rompido", detail: occurrence.title });
        }
      }

      if (inPeriod(occurrence.resolutionEscalatedAt, startAt, now)) {
        const owner = responsibleAt(occurrence, occurrence.resolutionEscalatedAt!);
        const person = owner ? people.get(owner.email.toLowerCase()) : null;
        if (person) {
          person.resolutionBreaches += 1;
          activities.push({ email: person.email, at: occurrence.resolutionEscalatedAt!, kind: "sla_breach", title: "SLA de normalização rompido", detail: occurrence.title });
        }
      }
    }

    for (const row of assignmentHistory) {
      if (!inPeriod(row.assignedAt, startAt, now)) continue;
      const person = people.get(row.assignedEmail.toLowerCase());
      if (!person) continue;
      const occurrence = occurrenceMap.get(row.occurrenceId);
      activities.push({
        email: person.email,
        at: row.assignedAt,
        kind: "assignment",
        title: row.assignmentSource === "escalation_rule" ? "Alerta atribuído por escalonamento" : row.assignmentSource === "take" ? "Alerta assumido" : "Alerta atribuído",
        detail: occurrence?.title ?? `Ocorrência #${row.occurrenceId}`,
      });
    }

    for (const task of tasks) {
      if (task.sourceActive && task.status !== "resolved" && task.assignedEmail) {
        const person = people.get(task.assignedEmail.toLowerCase());
        if (person) {
          person.activeTasks += 1;
          if (task.priority === "critical") person.criticalActive += 1;
        }
      }
    }

    const productiveTaskActions = new Set(["take", "status", "comment"]);
    for (const audit of taskAudit) {
      if (!productiveTaskActions.has(audit.action) || audit.performedBy === "system" || !inPeriod(audit.createdAt, startAt, now)) continue;
      const person = people.get(audit.performedBy.toLowerCase());
      if (!person) continue;
      person.taskIds.add(audit.taskId);
      person.taskActions += 1;
      const task = tasks.find((item) => item.id === audit.taskId);
      activities.push({
        email: person.email,
        at: audit.createdAt,
        kind: "task",
        title: taskActionLabel(audit.action, audit.toStatus),
        detail: task?.title ?? `Pendência #${audit.taskId}`,
      });
    }

    const rows = [...people.values()].map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      activeLoad: person.activeAlerts + person.activeTasks,
      activeAlerts: person.activeAlerts,
      activeTasks: person.activeTasks,
      escalatedActive: person.escalatedActive,
      criticalActive: person.criticalActive,
      alertsHandled: person.alertIds.size,
      tasksTouched: person.taskIds.size,
      taskActions: person.taskActions,
      acknowledgements: person.acknowledgements,
      normalizations: person.normalizations,
      mttaMinutes: average(person.ackDurations),
      mttrMinutes: average(person.resolutionDurations),
      avgResponsibilityMinutes: average(person.responsibilityDurations),
      ackBreaches: person.ackBreaches,
      resolutionBreaches: person.resolutionBreaches,
      slaBreaches: person.ackBreaches + person.resolutionBreaches,
    })).sort((a, b) => b.escalatedActive - a.escalatedActive || b.activeLoad - a.activeLoad || b.slaBreaches - a.slaBreaches || a.name.localeCompare(b.name));

    const allAckDurations = [...people.values()].flatMap((person) => person.ackDurations);
    const allResolutionDurations = [...people.values()].flatMap((person) => person.resolutionDurations);
    const activeAlertUnassigned = occurrences.filter((item) => item.status === "active" && !item.assignedEmail).length;
    const activeTaskUnassigned = tasks.filter((item) => item.sourceActive && item.status !== "resolved" && !item.assignedEmail).length;
    const sortedActivities = activities.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);

    return Response.json({
      generatedAt: now,
      period,
      startAt,
      currentUser: { email: auth.email },
      people: rows,
      activities: sortedActivities,
      currentItems: {
        alerts: occurrences.filter((item) => item.status === "active" && item.assignedEmail).map((item) => ({
          id: item.id,
          email: item.assignedEmail,
          title: item.title,
          priority: item.severity,
          accountName: item.accountName,
          escalated: Boolean(item.ackEscalatedAt || item.resolutionEscalatedAt),
        })),
        tasks: tasks.filter((item) => item.sourceActive && item.status !== "resolved" && item.assignedEmail).map((item) => ({
          id: item.id,
          email: item.assignedEmail,
          title: item.title,
          priority: item.priority,
          status: item.status,
          affectedAmount: Number(item.affectedAmount ?? 0),
        })),
      },
      summary: {
        activeLoad: rows.reduce((sum, row) => sum + row.activeLoad, 0),
        activeAlerts: rows.reduce((sum, row) => sum + row.activeAlerts, 0),
        activeTasks: rows.reduce((sum, row) => sum + row.activeTasks, 0),
        unassigned: activeAlertUnassigned + activeTaskUnassigned,
        escalatedActive: rows.reduce((sum, row) => sum + row.escalatedActive, 0),
        criticalActive: rows.reduce((sum, row) => sum + row.criticalActive, 0),
        alertsHandled: new Set([...people.values()].flatMap((person) => [...person.alertIds])).size,
        tasksTouched: new Set([...people.values()].flatMap((person) => [...person.taskIds])).size,
        acknowledgements: rows.reduce((sum, row) => sum + row.acknowledgements, 0),
        normalizations: rows.reduce((sum, row) => sum + row.normalizations, 0),
        mttaMinutes: average(allAckDurations),
        mttrMinutes: average(allResolutionDurations),
        slaBreaches: rows.reduce((sum, row) => sum + row.slaBreaches, 0),
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível consolidar a produtividade da Tesouraria." }, { status: 503 });
  }
}
