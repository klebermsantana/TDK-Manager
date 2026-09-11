import { asc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GET as getExecutiveAlerts } from "@/app/api/treasury-executive-alerts/route";
import { GET as getCapacityAlerts } from "@/app/api/treasury-capacity-alerts/route";
import { ensureTreasuryAlertSettings } from "@/app/treasury-executive-alerts-runtime";
import { ensureTreasuryCapacityAlertTables } from "@/app/treasury-capacity-alerts-runtime";
import { ensureTreasuryClosingTaskTables } from "@/app/treasury-closing-tasks-runtime";
import { assignDefaultOnEscalation } from "@/app/treasury-alert-assignment";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import {
  treasuryAlertOccurrences,
  treasuryAlertSettings,
  treasuryClosingTasks,
} from "@/db/treasury-closing-schema";
import { treasuryCapacityAlertOccurrences } from "@/db/treasury-routing-schema";
import { treasuryBankAccounts } from "@/db/treasury-schema";

const minuteMs = 60000;

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * minuteMs).toISOString();
}

function remainingMinutes(dueAt: string | null, now: string) {
  if (!dueAt) return null;
  return Math.ceil((new Date(dueAt).getTime() - new Date(now).getTime()) / minuteMs);
}

function alertTypeLabel(type: string) {
  if (type === "negative_forecast") return "Caixa projetado";
  if (type === "critical_task") return "Pendência crítica";
  if (type === "reconciliation") return "Conciliação";
  if (type === "closing_overdue") return "Fechamento";
  return "Tesouraria";
}

function preventiveTypeLabel(type: string) {
  if (type === "uncovered_skill") return "Preventivo · Sem cobertura";
  if (type === "single_point") return "Preventivo · Ponto único";
  if (type === "absence_without_coverage") return "Preventivo · Ausência sem cobertura";
  if (type === "low_capacity") return "Preventivo · Capacidade reduzida";
  return "Preventivo · Capacidade";
}

function taskDestination(issueType: string) {
  if (["statement_missing", "statement_outdated", "unallocated_statement"].includes(issueType)) return "reconciliation";
  if (issueType === "ledger_unassigned") return "ledger";
  if (["balance_difference", "base_anchor", "statement_balance_missing"].includes(issueType)) return "closing";
  return "tasks";
}

function daysUntil(date: string, now: string) {
  const today = now.slice(0, 10);
  const start = new Date(`${today}T12:00:00Z`).getTime();
  const end = new Date(`${date}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    await ensureTreasuryAlertSettings();
    await ensureTreasuryCapacityAlertTables();
    await ensureTreasuryClosingTaskTables();

    const [executiveSynchronization, preventiveSynchronization] = await Promise.all([
      getExecutiveAlerts(),
      getCapacityAlerts(),
    ]);
    if (!executiveSynchronization.ok) {
      const payload = await executiveSynchronization.json().catch(() => ({})) as { error?: string };
      return Response.json({ error: payload.error ?? "Não foi possível sincronizar a Tesouraria." }, { status: executiveSynchronization.status });
    }
    if (!preventiveSynchronization.ok) {
      const payload = await preventiveSynchronization.json().catch(() => ({})) as { error?: string };
      return Response.json({ error: payload.error ?? "Não foi possível sincronizar os preventivos." }, { status: preventiveSynchronization.status });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const [settings] = await db.select().from(treasuryAlertSettings).where(eq(treasuryAlertSettings.id, 1)).limit(1);
    if (!settings) return Response.json({ error: "Configuração de alertas não encontrada." }, { status: 500 });

    const activeOccurrences = (await db.select().from(treasuryAlertOccurrences))
      .filter((item) => item.status === "active");
    for (const occurrence of activeOccurrences) await assignDefaultOnEscalation(occurrence);

    const [occurrences, preventiveOccurrences, tasks, accounts] = await Promise.all([
      db.select().from(treasuryAlertOccurrences),
      db.select().from(treasuryCapacityAlertOccurrences),
      db.select().from(treasuryClosingTasks),
      db.select().from(treasuryBankAccounts).orderBy(asc(treasuryBankAccounts.name)),
    ]);
    const accountMap = new Map(accounts.map((account) => [account.id, account]));
    const email = auth.email.toLowerCase();

    const alerts = occurrences
      .filter((item) => item.status === "active" && (item.assignedEmail ?? "").toLowerCase() === email)
      .map((item) => {
        const ackLimit = item.severity === "critical" ? settings.criticalAckSlaMinutes : settings.highAckSlaMinutes;
        const dueAt = item.acknowledgedAt
          ? addMinutes(item.acknowledgedAt, settings.resolutionSlaMinutes)
          : addMinutes(item.firstSeenAt, ackLimit);
        const remaining = remainingMinutes(dueAt, now);
        const escalationStage = item.acknowledgedAt
          ? item.resolutionEscalatedAt ? "resolution_overdue" : null
          : item.ackEscalatedAt ? "ack_overdue" : null;
        return {
          kind: "alert" as const,
          id: item.id,
          title: item.title,
          detail: item.detail,
          recommendedAction: item.recommendedAction,
          accountName: item.accountName,
          priority: item.severity,
          amount: Number(item.amount ?? 0),
          alertType: item.alertType,
          alertTypeLabel: alertTypeLabel(item.alertType),
          acknowledgedAt: item.acknowledgedAt,
          acknowledgedBy: item.acknowledgedBy,
          firstSeenAt: item.firstSeenAt,
          assignedAt: item.assignedAt,
          assignmentSource: item.assignmentSource,
          escalationStage,
          slaDueAt: dueAt,
          slaRemainingMinutes: remaining,
          dueSoon: remaining !== null && remaining > 0 && remaining <= 30,
          destination: item.alertType,
        };
      });

    const preventives = preventiveOccurrences
      .filter((item) => item.status === "active" && (item.assignedEmail ?? "").toLowerCase() === email)
      .map((item) => {
        const remaining = remainingMinutes(item.preparationDueAt, now);
        return {
          kind: "preventive" as const,
          id: item.id,
          title: item.title,
          detail: item.detail,
          recommendedAction: item.recommendedAction,
          accountName: "Capacidade da Tesouraria",
          priority: item.severity,
          amount: 0,
          alertType: item.alertType,
          alertTypeLabel: preventiveTypeLabel(item.alertType),
          acknowledgedAt: item.acknowledgedAt,
          acknowledgedBy: item.acknowledgedBy,
          firstSeenAt: item.firstSeenAt,
          assignedAt: item.assignedAt,
          assignmentSource: item.assignmentSource,
          preparationEscalatedAt: item.preparationEscalatedAt,
          preparationDueAt: item.preparationDueAt,
          preparedAt: item.preparedAt,
          preparedBy: item.preparedBy,
          preparationNote: item.preparationNote,
          riskDate: item.riskDate,
          daysUntilRisk: daysUntil(item.riskDate, now),
          slaRemainingMinutes: remaining,
          dueSoon: !item.preparedAt && remaining !== null && remaining > 0 && remaining <= 1440,
          destination: "capacity_alerts" as const,
        };
      });

    const pendingTasks = tasks
      .filter((item) => item.sourceActive && item.status !== "resolved" && (item.assignedEmail ?? "").toLowerCase() === email)
      .map((item) => ({
        kind: "task" as const,
        id: item.id,
        title: item.title,
        detail: item.detail,
        recommendedAction: item.recommendedAction,
        accountName: item.bankAccountId ? accountMap.get(item.bankAccountId)?.name ?? `Conta #${item.bankAccountId}` : "Tesouraria consolidada",
        bankName: item.bankAccountId ? accountMap.get(item.bankAccountId)?.bankName ?? null : null,
        priority: item.priority,
        amount: Number(item.affectedAmount ?? 0),
        status: item.status,
        issueType: item.issueType,
        firstSeenDate: item.firstSeenDate,
        assignedName: item.assignedName,
        assignedEmail: item.assignedEmail,
        destination: taskDestination(item.issueType),
        escalationStage: null,
        slaRemainingMinutes: null,
        dueSoon: false,
      }));

    const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    const items = [...alerts, ...preventives, ...pendingTasks].sort((a, b) => {
      const escalatedA = a.kind === "alert" ? Boolean(a.escalationStage) : a.kind === "preventive" ? Boolean(a.preparationEscalatedAt && !a.preparedAt) : false;
      const escalatedB = b.kind === "alert" ? Boolean(b.escalationStage) : b.kind === "preventive" ? Boolean(b.preparationEscalatedAt && !b.preparedAt) : false;
      if (escalatedA !== escalatedB) return escalatedA ? -1 : 1;
      const dueA = a.kind !== "task" && a.slaRemainingMinutes !== null ? a.slaRemainingMinutes : Number.POSITIVE_INFINITY;
      const dueB = b.kind !== "task" && b.slaRemainingMinutes !== null ? b.slaRemainingMinutes : Number.POSITIVE_INFINITY;
      if (dueA !== dueB) return dueA - dueB;
      const priorityA = severityRank[a.priority] ?? 9;
      const priorityB = severityRank[b.priority] ?? 9;
      if (priorityA !== priorityB) return priorityA - priorityB;
      return b.amount - a.amount;
    });

    return Response.json({
      generatedAt: now,
      currentUser: { email: auth.email },
      items,
      summary: {
        total: items.length,
        alerts: alerts.length,
        preventives: preventives.length,
        tasks: pendingTasks.length,
        critical: items.filter((item) => item.priority === "critical").length,
        escalated: alerts.filter((item) => item.escalationStage).length + preventives.filter((item) => item.preparationEscalatedAt && !item.preparedAt).length,
        dueSoon: alerts.filter((item) => item.dueSoon).length + preventives.filter((item) => item.dueSoon).length,
        unacknowledged: alerts.filter((item) => !item.acknowledgedAt).length + preventives.filter((item) => !item.acknowledgedAt).length,
        preventivePrepared: preventives.filter((item) => item.preparedAt).length,
        inProgress: pendingTasks.filter((item) => item.status === "in_progress").length,
        waiting: pendingTasks.filter((item) => item.status === "waiting").length,
        affectedAmount: [...alerts, ...pendingTasks].reduce((sum, item) => sum + Math.abs(item.amount), 0),
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar seus alertas e pendências." }, { status: 503 });
  }
}
