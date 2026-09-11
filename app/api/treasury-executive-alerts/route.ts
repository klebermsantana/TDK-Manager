import { and, desc, eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { todaySaoPaulo } from "@/app/financial-ledger";
import { GET as getFlow } from "@/app/api/net-cash-flow/route";
import { GET as getAccounts } from "@/app/api/treasury-accounts/route";
import { GET as getClosing } from "@/app/api/treasury-closing/route";
import { GET as getOfficialClosing } from "@/app/api/treasury-official-closing/route";
import { GET as getClosingTasks } from "@/app/api/treasury-closing-tasks/route";
import { ensureTreasuryAlertSettings } from "@/app/treasury-executive-alerts-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { treasuryAlertOccurrenceAudit, treasuryAlertOccurrences, treasuryAlertSettings } from "@/db/treasury-closing-schema";

type AlertSeverity = "critical" | "high" | "medium";
type AlertType = "negative_forecast" | "critical_task" | "reconciliation" | "closing_overdue";
type ExecutiveAlert = {
  key: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail: string;
  action: string;
  bankAccountId: number | null;
  accountName: string;
  amount: number;
  metric: number | null;
};

const dayMs = 86400000;
const dateAtNoon = (key: string) => new Date(`${key}T12:00:00Z`);
const keyOf = (date: Date) => date.toISOString().slice(0, 10);

function previousWeekday(today: string) {
  const date = dateAtNoon(today);
  do date.setTime(date.getTime() - dayMs); while ([0, 6].includes(date.getUTCDay()));
  return keyOf(date);
}

function previousMonthLastWeekday(today: string) {
  const date = dateAtNoon(today);
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
  first.setTime(first.getTime() - dayMs);
  while ([0, 6].includes(first.getUTCDay())) first.setTime(first.getTime() - dayMs);
  return keyOf(first);
}

function addDays(today: string, days: number) {
  const date = dateAtNoon(today);
  date.setTime(date.getTime() + days * dayMs);
  return keyOf(date);
}

async function jsonOf(response: Response) {
  return response.json() as Promise<any>;
}

function projectedFor(movements: any[], currentBalance: number, today: string, horizon: number, bankAccountId?: number) {
  const limit = addDays(today, horizon);
  const scoped = bankAccountId ? movements.filter((item) => Number(item.bankAccountId) === bankAccountId) : movements;
  const inflow = scoped
    .filter((item) => item.type === "inflow" && Number(item.scheduledAmount) > 0 && item.dueDate && item.dueDate >= today && item.dueDate <= limit)
    .reduce((sum, item) => sum + Number(item.scheduledAmount), 0);
  const outflow = scoped
    .filter((item) => item.type === "outflow" && Number(item.scheduledAmount) > 0 && item.dueDate && item.dueDate <= limit)
    .reduce((sum, item) => sum + Number(item.scheduledAmount), 0);
  return { inflow, outflow, projected: currentBalance + inflow - outflow };
}

function monitoringEnabled(settings: typeof treasuryAlertSettings.$inferSelect, type: string) {
  if (type === "negative_forecast") return settings.negativeForecastEnabled;
  if (type === "critical_task") return settings.criticalTasksEnabled;
  if (type === "reconciliation") return settings.reconciliationEnabled;
  if (type === "closing_overdue") return settings.closingOverdueEnabled;
  return false;
}

async function synchronizeOccurrences(
  settings: typeof treasuryAlertSettings.$inferSelect,
  alerts: ExecutiveAlert[],
  now: string,
) {
  const db = getDb();
  const activeRows = await db.select().from(treasuryAlertOccurrences)
    .where(eq(treasuryAlertOccurrences.status, "active"));
  const activeByKey = new Map(activeRows.map((row) => [row.alertKey, row]));
  const currentKeys = new Set(alerts.map((alert) => alert.key));
  const enriched: Array<ExecutiveAlert & {
    occurrenceId: number;
    firstSeenAt: string;
    lastSeenAt: string;
    acknowledgedBy: string | null;
    acknowledgedAt: string | null;
    acknowledgementNote: string | null;
  }> = [];

  for (const alert of alerts) {
    let occurrence = activeByKey.get(alert.key);
    if (!occurrence) {
      [occurrence] = await db.insert(treasuryAlertOccurrences).values({
        alertKey: alert.key,
        alertType: alert.type,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        recommendedAction: alert.action,
        bankAccountId: alert.bankAccountId,
        accountName: alert.accountName,
        amount: alert.amount,
        metric: alert.metric,
        status: "active",
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      }).returning();
      await db.insert(treasuryAlertOccurrenceAudit).values({
        occurrenceId: occurrence.id,
        action: "detected",
        performedBy: "system",
        note: "Alerta detectado pelas regras executivas da Tesouraria.",
      });
    } else {
      [occurrence] = await db.update(treasuryAlertOccurrences).set({
        alertType: alert.type,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        recommendedAction: alert.action,
        bankAccountId: alert.bankAccountId,
        accountName: alert.accountName,
        amount: alert.amount,
        metric: alert.metric,
        lastSeenAt: now,
        updatedAt: now,
      }).where(eq(treasuryAlertOccurrences.id, occurrence.id)).returning();
    }

    enriched.push({
      ...alert,
      occurrenceId: occurrence.id,
      firstSeenAt: occurrence.firstSeenAt,
      lastSeenAt: occurrence.lastSeenAt,
      acknowledgedBy: occurrence.acknowledgedBy,
      acknowledgedAt: occurrence.acknowledgedAt,
      acknowledgementNote: occurrence.acknowledgementNote,
    });
  }

  for (const occurrence of activeRows) {
    if (currentKeys.has(occurrence.alertKey)) continue;
    const reason = monitoringEnabled(settings, occurrence.alertType) ? "condition_cleared" : "monitoring_disabled";
    await db.update(treasuryAlertOccurrences).set({
      status: "resolved",
      resolvedAt: now,
      resolutionReason: reason,
      updatedAt: now,
    }).where(eq(treasuryAlertOccurrences.id, occurrence.id));
    await db.insert(treasuryAlertOccurrenceAudit).values({
      occurrenceId: occurrence.id,
      action: "resolved",
      performedBy: "system",
      note: reason === "condition_cleared"
        ? "A condição que originou o alerta deixou de existir."
        : "A regra correspondente foi desativada; a ocorrência foi encerrada sem afirmar normalização técnica.",
    });
  }

  const history = await db.select().from(treasuryAlertOccurrences)
    .orderBy(desc(treasuryAlertOccurrences.firstSeenAt), desc(treasuryAlertOccurrences.id))
    .limit(100);
  return { enriched, history };
}

export async function GET() {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  try {
    await ensureTreasuryAlertSettings();
    const today = todaySaoPaulo();
    const db = getDb();
    const [settings] = await db.select().from(treasuryAlertSettings).where(eq(treasuryAlertSettings.id, 1)).limit(1);
    if (!settings) return Response.json({ error: "Configuração de alertas não encontrada." }, { status: 500 });

    const responses = await Promise.all([
      getAccounts(),
      getFlow(),
      getClosing(new Request(`http://tdk.local/api/treasury-closing?date=${encodeURIComponent(today)}`)),
      getOfficialClosing(),
      getClosingTasks(),
    ]);
    const payloads = await Promise.all(responses.map(jsonOf));
    const failedIndex = responses.findIndex((response) => !response.ok);
    if (failedIndex >= 0) {
      return Response.json({ error: payloads[failedIndex]?.error ?? "Não foi possível consolidar os alertas da Tesouraria." }, { status: responses[failedIndex].status });
    }

    const [accountsPayload, flowPayload, closingPayload, officialPayload, tasksPayload] = payloads;
    const accounts = (accountsPayload.accounts ?? []).filter((account: any) => account.active);
    const movements = flowPayload.movements ?? [];
    const closingAccounts = closingPayload.accounts ?? [];
    const latestActive = officialPayload.latestActive ?? [];
    const activeTasks = (tasksPayload.tasks ?? []).filter((task: any) => task.sourceActive && task.status !== "resolved");
    const alerts: ExecutiveAlert[] = [];

    if (settings.negativeForecastEnabled) {
      const currentBalance = accounts.reduce((sum: number, account: any) => sum + Number(account.currentBalance), 0);
      const consolidated = projectedFor(movements, currentBalance, today, settings.forecastHorizonDays);
      if (consolidated.projected < 0) {
        alerts.push({
          key: "forecast:consolidated",
          type: "negative_forecast",
          severity: "critical",
          title: `Caixa consolidado projetado negativo em ${settings.forecastHorizonDays} dias`,
          detail: `A projeção consolidada chega a ${consolidated.projected.toFixed(2)} considerando entradas a vencer e saídas programadas/vencidas.`,
          action: "Revise recebimentos previstos, obrigações e necessidade de capital antes do ponto de ruptura.",
          bankAccountId: null,
          accountName: "Tesouraria consolidada",
          amount: Math.abs(consolidated.projected),
          metric: consolidated.projected,
        });
      }
      for (const account of accounts) {
        const projected = projectedFor(movements, Number(account.currentBalance), today, settings.forecastHorizonDays, Number(account.id));
        if (projected.projected >= 0) continue;
        alerts.push({
          key: `forecast:account:${account.id}`,
          type: "negative_forecast",
          severity: "critical",
          title: `Saldo projetado negativo · ${account.name}`,
          detail: `${account.name}${account.bankName ? ` · ${account.bankName}` : ""} pode atingir ${projected.projected.toFixed(2)} em até ${settings.forecastHorizonDays} dias.`,
          action: "Abra a Tesouraria e revise a alocação das entradas/saídas desta conta.",
          bankAccountId: Number(account.id),
          accountName: String(account.name),
          amount: Math.abs(projected.projected),
          metric: projected.projected,
        });
      }
    }

    if (settings.criticalTasksEnabled) {
      for (const task of activeTasks.filter((item: any) => item.priority === "critical")) {
        alerts.push({
          key: `task:${task.id}`,
          type: "critical_task",
          severity: "critical",
          title: String(task.title),
          detail: String(task.detail),
          action: String(task.recommendedAction),
          bankAccountId: task.bankAccountId ? Number(task.bankAccountId) : null,
          accountName: String(task.accountName ?? "Tesouraria consolidada"),
          amount: Math.abs(Number(task.affectedAmount ?? 0)),
          metric: null,
        });
      }
    }

    if (settings.reconciliationEnabled) {
      for (const account of closingAccounts) {
        const transactionCount = Number(account.statementTransactionCount ?? 0);
        const coverage = Number(account.reconciliationCoverage ?? 100);
        if (!transactionCount || coverage >= Number(settings.reconciliationMinPct)) continue;
        alerts.push({
          key: `reconciliation:account:${account.accountId}`,
          type: "reconciliation",
          severity: "high",
          title: `Conciliação abaixo de ${Number(settings.reconciliationMinPct).toFixed(0)}% · ${account.accountName}`,
          detail: `A cobertura atual é ${coverage.toFixed(1)}% em ${transactionCount} lançamento(s) do extrato considerado(s) na conferência.`,
          action: "Abra a Conciliação Bancária e trate os lançamentos ainda sem destino.",
          bankAccountId: Number(account.accountId),
          accountName: String(account.accountName),
          amount: Math.abs(Number(account.unallocatedAmount ?? 0)),
          metric: coverage,
        });
      }
    }

    if (settings.closingOverdueEnabled) {
      const expectedDate = settings.closingCadence === "monthly" ? previousMonthLastWeekday(today) : previousWeekday(today);
      const latestByAccount = new Map(latestActive.map((record: any) => [Number(record.bankAccountId), record]));
      for (const account of accounts) {
        const latest: any = latestByAccount.get(Number(account.id));
        if (latest && String(latest.closingDate) >= expectedDate) continue;
        alerts.push({
          key: `closing:account:${account.id}`,
          type: "closing_overdue",
          severity: "high",
          title: `Fechamento ${settings.closingCadence === "monthly" ? "mensal" : "diário"} atrasado · ${account.name}`,
          detail: latest
            ? `Último fechamento ativo em ${latest.closingDate}; a regra atual exige proteção até pelo menos ${expectedDate}.`
            : `A conta ainda não possui fechamento oficial ativo; a regra atual exige proteção até ${expectedDate}.`,
          action: "Abra o Calendário/Fechamento Oficial, conclua as pendências da conferência e registre o fechamento.",
          bankAccountId: Number(account.id),
          accountName: String(account.name),
          amount: 0,
          metric: null,
        });
      }
    }

    const severityOrder: Record<AlertSeverity, number> = { critical: 0, high: 1, medium: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || b.amount - a.amount || a.title.localeCompare(b.title));

    const generatedAt = new Date().toISOString();
    const { enriched, history } = await synchronizeOccurrences(settings, alerts, generatedAt);
    return Response.json({
      generatedAt,
      date: today,
      settings,
      alerts: enriched,
      history,
      summary: {
        total: enriched.length,
        critical: enriched.filter((item) => item.severity === "critical").length,
        high: enriched.filter((item) => item.severity === "high").length,
        acknowledged: enriched.filter((item) => item.acknowledgedAt).length,
        unacknowledged: enriched.filter((item) => !item.acknowledgedAt).length,
        negativeForecast: enriched.filter((item) => item.type === "negative_forecast").length,
        criticalTasks: enriched.filter((item) => item.type === "critical_task").length,
        reconciliation: enriched.filter((item) => item.type === "reconciliation").length,
        closingOverdue: enriched.filter((item) => item.type === "closing_overdue").length,
        historyCount: history.length,
        resolvedHistory: history.filter((item) => item.status === "resolved").length,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar os alertas executivos da Tesouraria." }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });
  try {
    await ensureTreasuryAlertSettings();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");

    if (action === "acknowledge") {
      const occurrenceId = Number(payload.occurrenceId);
      const note = String(payload.note ?? "").trim().slice(0, 1000) || null;
      if (!Number.isInteger(occurrenceId) || occurrenceId <= 0) {
        return Response.json({ error: "Ocorrência de alerta inválida." }, { status: 400 });
      }
      const db = getDb();
      const [occurrence] = await db.select().from(treasuryAlertOccurrences)
        .where(and(eq(treasuryAlertOccurrences.id, occurrenceId), eq(treasuryAlertOccurrences.status, "active"))).limit(1);
      if (!occurrence) return Response.json({ error: "O alerta não está mais ativo." }, { status: 409 });
      if (occurrence.acknowledgedAt) {
        return Response.json({ error: `Este alerta já foi reconhecido por ${occurrence.acknowledgedBy ?? "outro usuário"}.` }, { status: 409 });
      }
      const now = new Date().toISOString();
      const [updated] = await db.update(treasuryAlertOccurrences).set({
        acknowledgedBy: auth.email,
        acknowledgedAt: now,
        acknowledgementNote: note,
        updatedAt: now,
      }).where(eq(treasuryAlertOccurrences.id, occurrenceId)).returning();
      await db.insert(treasuryAlertOccurrenceAudit).values({
        occurrenceId,
        action: "acknowledged",
        performedBy: auth.email,
        note: note ?? "Alerta reconhecido sem observação adicional.",
      });
      return Response.json({ occurrence: updated });
    }

    if (action && action !== "settings") {
      return Response.json({ error: "Ação de alerta inválida." }, { status: 400 });
    }

    const forecastHorizonDays = Number(payload.forecastHorizonDays);
    const reconciliationMinPct = Number(payload.reconciliationMinPct);
    const closingCadence = String(payload.closingCadence ?? "");
    if (![7, 30, 60, 90].includes(forecastHorizonDays)) {
      return Response.json({ error: "Horizonte inválido. Use 7, 30, 60 ou 90 dias." }, { status: 400 });
    }
    if (!Number.isFinite(reconciliationMinPct) || reconciliationMinPct < 0 || reconciliationMinPct > 100) {
      return Response.json({ error: "O limite de conciliação deve ficar entre 0% e 100%." }, { status: 400 });
    }
    if (!new Set(["daily", "monthly"]).has(closingCadence)) {
      return Response.json({ error: "Regra de fechamento inválida." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const [settings] = await getDb().update(treasuryAlertSettings).set({
      forecastHorizonDays,
      reconciliationMinPct,
      closingCadence,
      negativeForecastEnabled: payload.negativeForecastEnabled !== false,
      criticalTasksEnabled: payload.criticalTasksEnabled !== false,
      reconciliationEnabled: payload.reconciliationEnabled !== false,
      closingOverdueEnabled: payload.closingOverdueEnabled !== false,
      updatedBy: auth.email,
      updatedAt: now,
    }).where(eq(treasuryAlertSettings.id, 1)).returning();
    return Response.json({ settings });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível atualizar os alertas executivos." }, { status: 500 });
  }
}
