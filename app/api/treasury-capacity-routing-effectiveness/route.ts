import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ensureTreasuryCapacityAlertTables } from "@/app/treasury-capacity-alerts-runtime";
import { ensureTreasuryCapacityRoutingSettings } from "@/app/treasury-capacity-smart-routing-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { treasuryCapacityRoutingFeedback } from "@/db/treasury-capacity-routing-schema";
import {
  treasuryCapacityAlertAssignmentHistory,
  treasuryCapacityAlertOccurrences,
} from "@/db/treasury-routing-schema";

type Assignment = typeof treasuryCapacityAlertAssignmentHistory.$inferSelect;
type Occurrence = typeof treasuryCapacityAlertOccurrences.$inferSelect;
type Feedback = typeof treasuryCapacityRoutingFeedback.$inferSelect;
type GroupKey = "smart" | "manual" | "unassigned";

const minuteMs = 60_000;
const allowedHorizons = new Set([30, 90, 180]);

function sourceGroup(source: string | null | undefined): GroupKey {
  if (!source) return "unassigned";
  if (source === "smart_auto" || source === "smart_suggestion") return "smart";
  return "manual";
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

function avg(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function minutesBetween(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / minuteMs));
}

function distinctReassignment(assignments: Assignment[]) {
  if (assignments.length < 2) return false;
  let previous = assignments[0]?.userId ?? null;
  for (const row of assignments.slice(1)) {
    const current = row.userId ?? null;
    if (current !== previous) return true;
    previous = current;
  }
  return false;
}

function contextKey(row: Occurrence) {
  return row.domain ? `domain:${row.domain}` : `type:${row.alertType}`;
}

function contextLabel(row: Occurrence) {
  if (row.domain === "cash") return "Caixa";
  if (row.domain === "critical_tasks") return "Pendências críticas";
  if (row.domain === "reconciliation") return "Conciliação";
  if (row.domain === "closing") return "Fechamento";
  if (row.alertType === "uncovered_skill") return "Sem cobertura";
  if (row.alertType === "single_point") return "Ponto único";
  if (row.alertType === "absence_without_coverage") return "Ausência sem cobertura";
  if (row.alertType === "low_capacity") return "Capacidade reduzida";
  return row.alertType;
}

function groupMetrics(
  group: GroupKey,
  occurrences: Occurrence[],
  assignmentsByOccurrence: Map<number, Assignment[]>,
  now: string,
) {
  const rows = occurrences.filter((row) => {
    const assignments = assignmentsByOccurrence.get(row.id) ?? [];
    const firstSource = assignments[0]?.assignmentSource ?? row.assignmentSource;
    return sourceGroup(firstSource) === group;
  });

  let reassigned = 0;
  let prepared = 0;
  let slaEligible = 0;
  let slaOnTime = 0;
  let currentOverdue = 0;
  const preparationMinutes: number[] = [];

  for (const row of rows) {
    const assignments = assignmentsByOccurrence.get(row.id) ?? [];
    const firstAssignedAt = assignments[0]?.assignedAt ?? row.assignedAt;
    if (distinctReassignment(assignments)) reassigned += 1;
    if (row.preparedAt) {
      prepared += 1;
      if (firstAssignedAt) preparationMinutes.push(minutesBetween(firstAssignedAt, row.preparedAt));
      if (row.preparationDueAt) {
        slaEligible += 1;
        if (new Date(row.preparedAt).getTime() <= new Date(row.preparationDueAt).getTime()) slaOnTime += 1;
      }
    } else if (row.status === "active" && row.preparationDueAt && new Date(now).getTime() > new Date(row.preparationDueAt).getTime()) {
      currentOverdue += 1;
    }
  }

  return {
    group,
    assigned: rows.length,
    reassigned,
    reassignmentRatePct: pct(reassigned, rows.length),
    retained: rows.length - reassigned,
    retentionRatePct: pct(rows.length - reassigned, rows.length),
    prepared,
    preparationRatePct: pct(prepared, rows.length),
    slaEligible,
    slaOnTime,
    slaCompliancePct: pct(slaOnTime, slaEligible),
    avgAssignmentToPreparationMinutes: avg(preparationMinutes),
    currentOverdue,
  };
}

export async function GET(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureTreasuryCapacityAlertTables();
    await ensureTreasuryCapacityRoutingSettings();

    const url = new URL(request.url);
    const rawHorizon = url.searchParams.get("horizon") ?? "90";
    const allHistory = rawHorizon === "all";
    const parsed = Number(rawHorizon);
    const horizonDays = allHistory ? null : allowedHorizons.has(parsed) ? parsed : 90;
    const now = new Date().toISOString();
    const cutoff = horizonDays === null
      ? null
      : new Date(Date.now() - horizonDays * 86_400_000).toISOString();

    const db = getDb();
    const [allOccurrences, allAssignments, allFeedback] = await Promise.all([
      db.select().from(treasuryCapacityAlertOccurrences),
      db.select().from(treasuryCapacityAlertAssignmentHistory),
      db.select().from(treasuryCapacityRoutingFeedback),
    ]);

    const occurrences = allOccurrences
      .filter((row) => !cutoff || row.firstSeenAt >= cutoff)
      .sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt));
    const occurrenceIds = new Set(occurrences.map((row) => row.id));
    const assignments = allAssignments
      .filter((row) => occurrenceIds.has(row.occurrenceId))
      .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt) || a.id - b.id);
    const feedback = allFeedback
      .filter((row) => occurrenceIds.has(row.occurrenceId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const assignmentsByOccurrence = new Map<number, Assignment[]>();
    for (const row of assignments) {
      const list = assignmentsByOccurrence.get(row.occurrenceId) ?? [];
      list.push(row);
      assignmentsByOccurrence.set(row.occurrenceId, list);
    }

    const positive = feedback.filter((row) => row.feedback === "positive").length;
    const negative = feedback.filter((row) => row.feedback === "negative").length;
    const smartAssignments = assignments.filter((row) => row.assignmentSource === "smart_auto" || row.assignmentSource === "smart_suggestion");
    const smartAuto = smartAssignments.filter((row) => row.assignmentSource === "smart_auto").length;
    const smartSuggestion = smartAssignments.filter((row) => row.assignmentSource === "smart_suggestion").length;

    const smart = groupMetrics("smart", occurrences, assignmentsByOccurrence, now);
    const manual = groupMetrics("manual", occurrences, assignmentsByOccurrence, now);
    const unassigned = groupMetrics("unassigned", occurrences, assignmentsByOccurrence, now);

    const negativeReasons = new Map<string, number>();
    for (const row of feedback.filter((item) => item.feedback === "negative")) {
      negativeReasons.set(row.reasonCode, (negativeReasons.get(row.reasonCode) ?? 0) + 1);
    }
    const rejectionReasons = [...negativeReasons.entries()]
      .map(([reasonCode, count]) => ({ reasonCode, count, sharePct: pct(count, negative) }))
      .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode));

    const contextMap = new Map<string, {
      key: string;
      label: string;
      occurrences: number;
      smart: number;
      manual: number;
      reassigned: number;
      prepared: number;
      slaEligible: number;
      slaOnTime: number;
      positive: number;
      negative: number;
    }>();

    const occurrenceById = new Map(occurrences.map((row) => [row.id, row]));
    for (const row of occurrences) {
      const key = contextKey(row);
      const current = contextMap.get(key) ?? {
        key,
        label: contextLabel(row),
        occurrences: 0,
        smart: 0,
        manual: 0,
        reassigned: 0,
        prepared: 0,
        slaEligible: 0,
        slaOnTime: 0,
        positive: 0,
        negative: 0,
      };
      current.occurrences += 1;
      const assignmentRows = assignmentsByOccurrence.get(row.id) ?? [];
      const group = sourceGroup(assignmentRows[0]?.assignmentSource ?? row.assignmentSource);
      if (group === "smart") current.smart += 1;
      if (group === "manual") current.manual += 1;
      if (distinctReassignment(assignmentRows)) current.reassigned += 1;
      if (row.preparedAt) {
        current.prepared += 1;
        if (row.preparationDueAt) {
          current.slaEligible += 1;
          if (new Date(row.preparedAt).getTime() <= new Date(row.preparationDueAt).getTime()) current.slaOnTime += 1;
        }
      }
      contextMap.set(key, current);
    }

    for (const row of feedback) {
      const occurrence = occurrenceById.get(row.occurrenceId);
      if (!occurrence) continue;
      const key = contextKey(occurrence);
      const current = contextMap.get(key);
      if (!current) continue;
      if (row.feedback === "positive") current.positive += 1;
      else current.negative += 1;
    }

    const byContext = [...contextMap.values()]
      .map((row) => ({
        ...row,
        smartSharePct: pct(row.smart, row.smart + row.manual),
        reassignmentRatePct: pct(row.reassigned, row.smart + row.manual),
        slaCompliancePct: pct(row.slaOnTime, row.slaEligible),
        feedbackAcceptancePct: pct(row.positive, row.positive + row.negative),
      }))
      .sort((a, b) => b.occurrences - a.occurrences || a.label.localeCompare(b.label));

    const recentOccurrences = occurrences.slice(0, 50).map((row) => {
      const assignmentRows = assignmentsByOccurrence.get(row.id) ?? [];
      const first = assignmentRows[0] ?? null;
      const group = sourceGroup(first?.assignmentSource ?? row.assignmentSource);
      const reassigned = distinctReassignment(assignmentRows);
      const slaResult = row.preparedAt && row.preparationDueAt
        ? new Date(row.preparedAt).getTime() <= new Date(row.preparationDueAt).getTime() ? "on_time" : "late"
        : row.status === "active" && !row.preparedAt && row.preparationDueAt && new Date(now).getTime() > new Date(row.preparationDueAt).getTime()
          ? "overdue"
          : "open";
      return {
        occurrenceId: row.id,
        title: row.title,
        riskDate: row.riskDate,
        severity: row.severity,
        context: contextLabel(row),
        firstSeenAt: row.firstSeenAt,
        assignmentGroup: group,
        assignmentSource: first?.assignmentSource ?? row.assignmentSource ?? null,
        firstAssignedName: first?.assignedName ?? row.assignedName ?? null,
        reassigned,
        preparedAt: row.preparedAt,
        preparationDueAt: row.preparationDueAt,
        slaResult,
      };
    });

    return Response.json({
      generatedAt: now,
      currentUser: { email: auth.email },
      horizon: allHistory ? "all" : horizonDays,
      cohortDefinition: "first_seen_at",
      summary: {
        occurrences: occurrences.length,
        assigned: smart.assigned + manual.assigned,
        unassigned: unassigned.assigned,
        smartAssigned: smart.assigned,
        manualAssigned: manual.assigned,
        smartAuto,
        smartSuggestion,
        feedbackEvaluations: feedback.length,
        feedbackPositive: positive,
        feedbackNegative: negative,
        feedbackAcceptancePct: pct(positive, positive + negative),
        smartReassignmentRatePct: smart.reassignmentRatePct,
        manualReassignmentRatePct: manual.reassignmentRatePct,
        smartSlaCompliancePct: smart.slaCompliancePct,
        manualSlaCompliancePct: manual.slaCompliancePct,
      },
      comparison: { smart, manual },
      rejectionReasons,
      byContext,
      recentOccurrences,
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Não foi possível calcular a eficácia do roteamento preventivo.",
    }, { status: 503 });
  }
}
