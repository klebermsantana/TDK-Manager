import { and, desc, eq, isNull } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GET as getCapacityForecast } from "@/app/api/treasury-capacity-forecast/route";
import { listTreasuryAlertUsers } from "@/app/treasury-alert-assignment";
import { ensureTreasuryCapacityAlertTables } from "@/app/treasury-capacity-alerts-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import {
  treasuryCapacityAlertAssignmentHistory,
  treasuryCapacityAlertAudit,
  treasuryCapacityAlertOccurrences,
  treasuryCapacityAlertSettings,
} from "@/db/treasury-routing-schema";

type AlertType = "uncovered_skill" | "single_point" | "absence_without_coverage" | "low_capacity";
type Severity = "critical" | "high" | "medium";
type AssignmentSource = "manual" | "take";
type PreventiveAlert = {
  key: string;
  type: AlertType;
  severity: Severity;
  riskDate: string;
  domain: string | null;
  title: string;
  detail: string;
  action: string;
};

const minuteMs = 60_000;

function enabled(settings: typeof treasuryCapacityAlertSettings.$inferSelect, type: AlertType) {
  if (type === "uncovered_skill") return settings.uncoveredEnabled;
  if (type === "single_point") return settings.singlePointEnabled;
  if (type === "absence_without_coverage") return settings.absenceWithoutCoverageEnabled;
  return settings.lowCapacityEnabled;
}

function daysBetween(today: string, riskDate: string) {
  const start = new Date(`${today}T12:00:00Z`).getTime();
  const end = new Date(`${riskDate}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

function preparationDueAt(riskDate: string, leadBusinessDays: number) {
  const date = new Date(`${riskDate}T12:00:00Z`);
  let remaining = Math.max(1, leadBusinessDays);
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() - 1);
    const day = date.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  const key = date.toISOString().slice(0, 10);
  return new Date(`${key}T17:00:00-03:00`).toISOString();
}

function remainingMinutes(dueAt: string | null, now: string) {
  if (!dueAt) return null;
  return Math.ceil((new Date(dueAt).getTime() - new Date(now).getTime()) / minuteMs);
}

async function closeOpenAssignmentHistory(occurrenceId: number, performedBy: string, at: string) {
  await getDb().update(treasuryCapacityAlertAssignmentHistory).set({
    unassignedAt: at,
    unassignedBy: performedBy,
  }).where(and(
    eq(treasuryCapacityAlertAssignmentHistory.occurrenceId, occurrenceId),
    isNull(treasuryCapacityAlertAssignmentHistory.unassignedAt),
  ));
}

async function assignOccurrence(args: {
  occurrenceId: number;
  userId: number | null;
  source: AssignmentSource;
  performedBy: string;
  note?: string | null;
}) {
  const db = getDb();
  const [occurrence] = await db.select().from(treasuryCapacityAlertOccurrences)
    .where(eq(treasuryCapacityAlertOccurrences.id, args.occurrenceId)).limit(1);
  if (!occurrence || occurrence.status !== "active") throw new Error("Alerta preventivo ativo não encontrado.");
  const now = new Date().toISOString();

  if (args.userId === null) {
    await closeOpenAssignmentHistory(occurrence.id, args.performedBy, now);
    const [updated] = await db.update(treasuryCapacityAlertOccurrences).set({
      assignedUserId: null,
      assignedName: null,
      assignedEmail: null,
      assignedAt: null,
      assignmentSource: null,
      updatedAt: now,
    }).where(eq(treasuryCapacityAlertOccurrences.id, occurrence.id)).returning();
    await db.insert(treasuryCapacityAlertAudit).values({
      occurrenceId: occurrence.id,
      action: "unassigned",
      performedBy: args.performedBy,
      note: args.note ?? "Responsável removido do alerta preventivo.",
    });
    return updated;
  }

  const candidates = await listTreasuryAlertUsers();
  const user = candidates.find((row) => row.id === args.userId);
  if (!user) throw new Error("O usuário selecionado não possui acesso ativo à Tesouraria.");
  if (occurrence.assignedUserId === user.id) return occurrence;

  await closeOpenAssignmentHistory(occurrence.id, args.performedBy, now);
  const [updated] = await db.update(treasuryCapacityAlertOccurrences).set({
    assignedUserId: user.id,
    assignedName: user.name,
    assignedEmail: user.email,
    assignedAt: now,
    assignmentSource: args.source,
    updatedAt: now,
  }).where(eq(treasuryCapacityAlertOccurrences.id, occurrence.id)).returning();
  await db.insert(treasuryCapacityAlertAssignmentHistory).values({
    occurrenceId: occurrence.id,
    userId: user.id,
    assignedName: user.name,
    assignedEmail: user.email,
    assignmentSource: args.source,
    assignedBy: args.performedBy,
    assignedAt: now,
  });
  await db.insert(treasuryCapacityAlertAudit).values({
    occurrenceId: occurrence.id,
    action: args.source === "take" ? "taken" : "assigned",
    performedBy: args.performedBy,
    note: args.note ?? `${user.name} <${user.email}> definido como responsável preventivo.`,
  });
  return updated;
}

async function synchronize(
  settings: typeof treasuryCapacityAlertSettings.$inferSelect,
  alerts: PreventiveAlert[],
  today: string,
  endDate: string,
  now: string,
) {
  const db = getDb();
  const activeRows = await db.select().from(treasuryCapacityAlertOccurrences)
    .where(eq(treasuryCapacityAlertOccurrences.status, "active"));
  const activeByKey = new Map(activeRows.map((row) => [row.alertKey, row]));
  const currentKeys = new Set(alerts.map((alert) => alert.key));
  const enriched: any[] = [];

  for (const alert of alerts) {
    const dueAt = preparationDueAt(alert.riskDate, settings.preparationLeadBusinessDays);
    let occurrence = activeByKey.get(alert.key);
    if (!occurrence) {
      [occurrence] = await db.insert(treasuryCapacityAlertOccurrences).values({
        alertKey: alert.key,
        alertType: alert.type,
        severity: alert.severity,
        riskDate: alert.riskDate,
        domain: alert.domain,
        title: alert.title,
        detail: alert.detail,
        recommendedAction: alert.action,
        status: "active",
        firstSeenAt: now,
        lastSeenAt: now,
        preparationDueAt: dueAt,
        updatedAt: now,
      }).returning();
      await db.insert(treasuryCapacityAlertAudit).values({
        occurrenceId: occurrence.id,
        action: "detected",
        performedBy: "system",
        note: "Risco futuro detectado pela previsão de capacidade da Tesouraria.",
      });
    } else {
      [occurrence] = await db.update(treasuryCapacityAlertOccurrences).set({
        alertType: alert.type,
        severity: alert.severity,
        riskDate: alert.riskDate,
        domain: alert.domain,
        title: alert.title,
        detail: alert.detail,
        recommendedAction: alert.action,
        lastSeenAt: now,
        preparationDueAt: dueAt,
        updatedAt: now,
      }).where(eq(treasuryCapacityAlertOccurrences.id, occurrence.id)).returning();
    }

    if (!occurrence.preparedAt && new Date(now).getTime() > new Date(dueAt).getTime() && !occurrence.preparationEscalatedAt) {
      [occurrence] = await db.update(treasuryCapacityAlertOccurrences).set({
        preparationEscalatedAt: now,
        updatedAt: now,
      }).where(eq(treasuryCapacityAlertOccurrences.id, occurrence.id)).returning();
      await db.insert(treasuryCapacityAlertAudit).values({
        occurrenceId: occurrence.id,
        action: "preparation_sla_breached",
        performedBy: "system",
        note: `SLA preventivo excedido: a preparação deveria estar concluída até ${dueAt}.`,
      });
    }

    enriched.push({
      ...alert,
      occurrenceId: occurrence.id,
      firstSeenAt: occurrence.firstSeenAt,
      lastSeenAt: occurrence.lastSeenAt,
      acknowledgedBy: occurrence.acknowledgedBy,
      acknowledgedAt: occurrence.acknowledgedAt,
      acknowledgementNote: occurrence.acknowledgementNote,
      assignedUserId: occurrence.assignedUserId,
      assignedName: occurrence.assignedName,
      assignedEmail: occurrence.assignedEmail,
      assignedAt: occurrence.assignedAt,
      assignmentSource: occurrence.assignmentSource,
      preparationDueAt: occurrence.preparationDueAt ?? dueAt,
      preparationRemainingMinutes: remainingMinutes(occurrence.preparationDueAt ?? dueAt, now),
      preparationEscalatedAt: occurrence.preparationEscalatedAt,
      preparedBy: occurrence.preparedBy,
      preparedAt: occurrence.preparedAt,
      preparationNote: occurrence.preparationNote,
      daysUntilRisk: daysBetween(today, alert.riskDate),
    });
  }

  for (const occurrence of activeRows) {
    if (currentKeys.has(occurrence.alertKey)) continue;
    const type = occurrence.alertType as AlertType;
    let reason = "condition_cleared";
    if (!enabled(settings, type)) reason = "monitoring_disabled";
    else if (occurrence.riskDate < today) reason = "risk_date_passed";
    else if (occurrence.riskDate > endDate) reason = "outside_monitoring_window";
    await db.update(treasuryCapacityAlertOccurrences).set({
      status: "resolved",
      resolvedAt: now,
      resolutionReason: reason,
      updatedAt: now,
    }).where(eq(treasuryCapacityAlertOccurrences.id, occurrence.id));
    await closeOpenAssignmentHistory(occurrence.id, "system", now);
    await db.insert(treasuryCapacityAlertAudit).values({
      occurrenceId: occurrence.id,
      action: "resolved",
      performedBy: "system",
      note: reason === "condition_cleared"
        ? "O risco futuro deixou de existir na previsão atual."
        : reason === "monitoring_disabled"
          ? "A regra preventiva correspondente foi desativada."
          : reason === "outside_monitoring_window"
            ? "A data de risco saiu da janela de monitoramento configurada."
            : "A data prevista do risco já passou; ocorrência encerrada para preservar o histórico.",
    });
  }

  const history = await db.select().from(treasuryCapacityAlertOccurrences)
    .orderBy(desc(treasuryCapacityAlertOccurrences.firstSeenAt), desc(treasuryCapacityAlertOccurrences.id))
    .limit(100);
  return { enriched, history };
}

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryCapacityAlertTables();
    const db = getDb();
    const [settings] = await db.select().from(treasuryCapacityAlertSettings)
      .where(eq(treasuryCapacityAlertSettings.id, 1)).limit(1);
    if (!settings) return Response.json({ error: "Configuração preventiva não encontrada." }, { status: 500 });

    const forecastResponse = await getCapacityForecast(new Request(`http://tdk.local/api/treasury-capacity-forecast?horizon=${settings.lookaheadDays}`));
    const forecast = await forecastResponse.json() as any;
    if (!forecastResponse.ok) return Response.json({ error: forecast.error ?? "Não foi possível calcular a previsão de capacidade." }, { status: forecastResponse.status });

    const alerts: PreventiveAlert[] = [];
    if (settings.uncoveredEnabled) {
      for (const day of forecast.days ?? []) {
        for (const domain of day.domains ?? []) {
          if (!domain.uncovered) continue;
          alerts.push({
            key: `capacity:uncovered:${day.date}:${domain.domain}`,
            type: "uncovered_skill",
            severity: "critical",
            riskDate: day.date,
            domain: domain.domain,
            title: `${domain.label} ficará sem cobertura em ${day.date}`,
            detail: `Nenhuma pessoa elegível estará disponível para ${domain.label} nessa data.`,
            action: "Revise Escalas e Competências e defina cobertura habilitada antes da data de risco.",
          });
        }
      }
    }

    if (settings.singlePointEnabled) {
      for (const day of forecast.days ?? []) {
        for (const domain of day.domains ?? []) {
          if (!domain.singlePoint || domain.uncovered) continue;
          const person = domain.people?.[0]?.name ?? "um único responsável";
          alerts.push({
            key: `capacity:single:${day.date}:${domain.domain}`,
            type: "single_point",
            severity: "high",
            riskDate: day.date,
            domain: domain.domain,
            title: `Ponto único em ${domain.label} em ${day.date}`,
            detail: `${person} será a única pessoa elegível para ${domain.label}.`,
            action: "Crie cobertura alternativa ou ajuste competência/escala para reduzir dependência de uma única pessoa.",
          });
        }
      }
    }

    if (settings.absenceWithoutCoverageEnabled) {
      for (const absence of forecast.absences ?? []) {
        if (absence.coverageUserId) continue;
        const severity: Severity = absence.type === "reduced_hours" ? "medium" : "high";
        alerts.push({
          key: `capacity:absence:${absence.id}`,
          type: "absence_without_coverage",
          severity,
          riskDate: absence.startDate,
          domain: null,
          title: `${absence.userName} tem ausência sem cobertura definida`,
          detail: `${absence.startDate} a ${absence.endDate}${absence.type === "reduced_hours" ? " com jornada reduzida" : ""}.`,
          action: "Defina uma cobertura temporária em Escalas e confirme que o substituto possui competência adequada.",
        });
      }
    }

    if (settings.lowCapacityEnabled) {
      for (const day of forecast.days ?? []) {
        if (Number(day.capacityPct) >= Number(settings.lowCapacityThresholdPct)) continue;
        alerts.push({
          key: `capacity:low:${day.date}`,
          type: "low_capacity",
          severity: Number(day.capacityPct) < 50 ? "critical" : "high",
          riskDate: day.date,
          domain: null,
          title: `Capacidade prevista de ${day.capacityPct}% em ${day.date}`,
          detail: `A equipe terá ${day.effectiveCapacity}/${day.fullCapacity} FTE equivalente nessa data.`,
          action: "Revise ausências, jornadas reduzidas e coberturas antes de redistribuir a carga operacional.",
        });
      }
    }

    const now = new Date().toISOString();
    const synchronized = await synchronize(settings, alerts, forecast.today, forecast.endDate, now);
    const active = synchronized.enriched.sort((a, b) => {
      const escalatedA = a.preparationEscalatedAt && !a.preparedAt ? 0 : 1;
      const escalatedB = b.preparationEscalatedAt && !b.preparedAt ? 0 : 1;
      if (escalatedA !== escalatedB) return escalatedA - escalatedB;
      return a.riskDate.localeCompare(b.riskDate) || (a.severity === "critical" ? -1 : 1);
    });
    const users = await listTreasuryAlertUsers();
    const currentUser = users.find((row) => row.email.toLowerCase() === auth.email.toLowerCase()) ?? null;
    return Response.json({
      generatedAt: now,
      settings,
      today: forecast.today,
      endDate: forecast.endDate,
      currentUser: { id: currentUser?.id ?? null, email: auth.email },
      users,
      active,
      history: synchronized.history,
      summary: {
        active: active.length,
        critical: active.filter((row) => row.severity === "critical").length,
        high: active.filter((row) => row.severity === "high").length,
        medium: active.filter((row) => row.severity === "medium").length,
        unacknowledged: active.filter((row) => !row.acknowledgedAt).length,
        unassigned: active.filter((row) => !row.assignedUserId).length,
        preparationOverdue: active.filter((row) => row.preparationEscalatedAt && !row.preparedAt).length,
        prepared: active.filter((row) => row.preparedAt).length,
        nearestRiskDays: active.length ? Math.min(...active.map((row) => row.daysUntilRisk)) : null,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar alertas preventivos de capacidade." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryCapacityAlertTables();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const db = getDb();
    const now = new Date().toISOString();

    if (action === "acknowledge") {
      const occurrenceId = Number(payload.occurrenceId);
      if (!Number.isInteger(occurrenceId) || occurrenceId <= 0) return Response.json({ error: "Ocorrência inválida." }, { status: 400 });
      const [row] = await db.select().from(treasuryCapacityAlertOccurrences)
        .where(eq(treasuryCapacityAlertOccurrences.id, occurrenceId)).limit(1);
      if (!row || row.status !== "active") return Response.json({ error: "Alerta preventivo ativo não encontrado." }, { status: 404 });
      const note = String(payload.note ?? "").trim().slice(0, 1000) || null;
      const [updated] = await db.update(treasuryCapacityAlertOccurrences).set({
        acknowledgedBy: auth.email,
        acknowledgedAt: row.acknowledgedAt ?? now,
        acknowledgementNote: note ?? row.acknowledgementNote,
        updatedAt: now,
      }).where(eq(treasuryCapacityAlertOccurrences.id, occurrenceId)).returning();
      await db.insert(treasuryCapacityAlertAudit).values({
        occurrenceId,
        action: "acknowledged",
        performedBy: auth.email,
        note: note ?? "Risco preventivo reconhecido.",
      });
      return Response.json({ occurrence: updated });
    }

    if (action === "assign" || action === "take") {
      const occurrenceId = Number(payload.occurrenceId);
      if (!Number.isInteger(occurrenceId) || occurrenceId <= 0) return Response.json({ error: "Ocorrência inválida." }, { status: 400 });
      let userId = payload.userId === null || payload.userId === undefined ? null : Number(payload.userId);
      let source: AssignmentSource = "manual";
      if (action === "take") {
        const users = await listTreasuryAlertUsers();
        const current = users.find((row) => row.email.toLowerCase() === auth.email.toLowerCase());
        if (!current) return Response.json({ error: "Seu usuário não está habilitado para a Tesouraria." }, { status: 403 });
        userId = current.id;
        source = "take";
      } else if (userId !== null && (!Number.isInteger(userId) || userId <= 0)) {
        return Response.json({ error: "Responsável inválido." }, { status: 400 });
      }
      const occurrence = await assignOccurrence({
        occurrenceId,
        userId,
        source,
        performedBy: auth.email,
      });
      return Response.json({ occurrence });
    }

    if (action === "prepare") {
      const occurrenceId = Number(payload.occurrenceId);
      if (!Number.isInteger(occurrenceId) || occurrenceId <= 0) return Response.json({ error: "Ocorrência inválida." }, { status: 400 });
      let [row] = await db.select().from(treasuryCapacityAlertOccurrences)
        .where(eq(treasuryCapacityAlertOccurrences.id, occurrenceId)).limit(1);
      if (!row || row.status !== "active") return Response.json({ error: "Alerta preventivo ativo não encontrado." }, { status: 404 });
      if (!row.assignedUserId) {
        const users = await listTreasuryAlertUsers();
        const current = users.find((candidate) => candidate.email.toLowerCase() === auth.email.toLowerCase());
        if (current) row = await assignOccurrence({
          occurrenceId,
          userId: current.id,
          source: "take",
          performedBy: auth.email,
          note: "Responsabilidade assumida automaticamente ao registrar a preparação preventiva.",
        });
      }
      const note = String(payload.note ?? "").trim().slice(0, 1000) || null;
      const [updated] = await db.update(treasuryCapacityAlertOccurrences).set({
        preparedBy: auth.email,
        preparedAt: row.preparedAt ?? now,
        preparationNote: note ?? row.preparationNote,
        updatedAt: now,
      }).where(eq(treasuryCapacityAlertOccurrences.id, occurrenceId)).returning();
      await db.insert(treasuryCapacityAlertAudit).values({
        occurrenceId,
        action: "prepared",
        performedBy: auth.email,
        note: note ?? "Ação preventiva marcada como preparada.",
      });
      return Response.json({ occurrence: updated });
    }

    if (action === "settings") {
      const lookaheadDays = Number(payload.lookaheadDays);
      const threshold = Number(payload.lowCapacityThresholdPct);
      const preparationLeadBusinessDays = Number(payload.preparationLeadBusinessDays);
      if (![7, 15, 30].includes(lookaheadDays)) return Response.json({ error: "Antecedência deve ser 7, 15 ou 30 dias." }, { status: 400 });
      if (!Number.isFinite(threshold) || threshold < 30 || threshold > 100) return Response.json({ error: "Limite de capacidade deve ficar entre 30% e 100%." }, { status: 400 });
      if (![1, 2, 3, 5].includes(preparationLeadBusinessDays)) return Response.json({ error: "SLA de preparação deve ser 1, 2, 3 ou 5 dias úteis." }, { status: 400 });
      const [updated] = await db.update(treasuryCapacityAlertSettings).set({
        lookaheadDays,
        lowCapacityThresholdPct: threshold,
        preparationLeadBusinessDays,
        uncoveredEnabled: Boolean(payload.uncoveredEnabled),
        singlePointEnabled: Boolean(payload.singlePointEnabled),
        absenceWithoutCoverageEnabled: Boolean(payload.absenceWithoutCoverageEnabled),
        lowCapacityEnabled: Boolean(payload.lowCapacityEnabled),
        updatedBy: auth.email,
        updatedAt: now,
      }).where(eq(treasuryCapacityAlertSettings.id, 1)).returning();
      return Response.json({ settings: updated });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar os alertas preventivos." }, { status: 500 });
  }
}
