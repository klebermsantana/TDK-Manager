import { eq } from "drizzle-orm";
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
import { treasuryAlertSettings } from "@/db/treasury-closing-schema";

type AlertSeverity = "critical" | "high" | "medium";
type ExecutiveAlert = {
  key: string;
  type: "negative_forecast" | "critical_task" | "reconciliation" | "closing_overdue";
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
          key: `forecast:consolidated:${settings.forecastHorizonDays}`,
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
          key: `forecast:account:${account.id}:${settings.forecastHorizonDays}`,
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
          key: `reconciliation:${account.accountId}`,
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
          key: `closing:${settings.closingCadence}:${account.id}:${expectedDate}`,
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

    return Response.json({
      generatedAt: new Date().toISOString(),
      date: today,
      settings,
      alerts,
      summary: {
        total: alerts.length,
        critical: alerts.filter((item) => item.severity === "critical").length,
        high: alerts.filter((item) => item.severity === "high").length,
        negativeForecast: alerts.filter((item) => item.type === "negative_forecast").length,
        criticalTasks: alerts.filter((item) => item.type === "critical_task").length,
        reconciliation: alerts.filter((item) => item.type === "reconciliation").length,
        closingOverdue: alerts.filter((item) => item.type === "closing_overdue").length,
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
  } catch {
    return Response.json({ error: "Não foi possível salvar as regras de alerta." }, { status: 500 });
  }
}
