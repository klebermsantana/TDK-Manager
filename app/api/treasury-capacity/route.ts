import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GET as getExecutiveAlerts } from "@/app/api/treasury-executive-alerts/route";
import { ensureTreasuryAlertSettings } from "@/app/treasury-executive-alerts-runtime";
import { assignDefaultOnEscalation, listTreasuryAlertUsers } from "@/app/treasury-alert-assignment";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import {
  treasuryAlertOccurrences,
  treasuryAlertSettings,
  treasuryClosingTasks,
} from "@/db/treasury-closing-schema";

type CapacityState = "available" | "balanced" | "overloaded";
type ItemKind = "alert" | "task";

type LoadItem = {
  key: string;
  kind: ItemKind;
  id: number;
  title: string;
  detail: string;
  priority: "critical" | "high" | "medium";
  accountName: string;
  ownerUserId: number | null;
  ownerName: string | null;
  ownerEmail: string | null;
  weight: number;
  escalated: boolean;
  dueSoon: boolean;
  slaRemainingMinutes: number | null;
  acknowledged: boolean;
  status: string;
};

type PersonLoad = {
  id: number;
  name: string;
  email: string;
  role: string;
  points: number;
  items: number;
  alerts: number;
  tasks: number;
  critical: number;
  escalated: number;
  dueSoon: number;
  state: CapacityState;
  utilizationPct: number;
};

const minuteMs = 60000;
const alertBase: Record<string, number> = { critical: 4, high: 3, medium: 2 };
const taskBase: Record<string, number> = { critical: 3, high: 2, medium: 1 };

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * minuteMs).toISOString();
}

function minutesUntil(value: string, now: string) {
  return Math.ceil((new Date(value).getTime() - new Date(now).getTime()) / minuteMs);
}

function stateFor(points: number, reference: number, escalated: number, critical: number): CapacityState {
  const overloadLine = Math.max(8, reference * 1.4);
  const availableLine = Math.max(3, reference * 0.7);
  if (escalated >= 2 || points >= overloadLine || (critical >= 3 && points >= 6)) return "overloaded";
  if (escalated === 0 && points <= availableLine) return "available";
  return "balanced";
}

function itemPriorityRank(item: LoadItem) {
  const priority = item.priority === "critical" ? 0 : item.priority === "high" ? 1 : 2;
  return (item.escalated ? -100 : 0) + (item.dueSoon ? -50 : 0) + priority * 10 - item.weight;
}

export async function GET() {
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

    const db = getDb();
    const now = new Date().toISOString();
    const [settings] = await db.select().from(treasuryAlertSettings).where(eq(treasuryAlertSettings.id, 1)).limit(1);
    if (!settings) return Response.json({ error: "Configuração de alertas não encontrada." }, { status: 500 });

    const activeOccurrences = (await db.select().from(treasuryAlertOccurrences)).filter((item) => item.status === "active");
    for (const occurrence of activeOccurrences) await assignDefaultOnEscalation(occurrence);

    const [users, occurrences, tasks] = await Promise.all([
      listTreasuryAlertUsers(),
      db.select().from(treasuryAlertOccurrences),
      db.select().from(treasuryClosingTasks),
    ]);

    const items: LoadItem[] = [];
    for (const item of occurrences.filter((row) => row.status === "active")) {
      const ackLimit = item.severity === "critical" ? settings.criticalAckSlaMinutes : settings.highAckSlaMinutes;
      const dueAt = item.acknowledgedAt
        ? addMinutes(item.acknowledgedAt, settings.resolutionSlaMinutes)
        : addMinutes(item.firstSeenAt, ackLimit);
      const remaining = minutesUntil(dueAt, now);
      const escalated = Boolean(item.ackEscalatedAt || item.resolutionEscalatedAt);
      const dueSoon = remaining > 0 && remaining <= 30;
      const priority = (new Set(["critical", "high", "medium"]).has(item.severity) ? item.severity : "high") as LoadItem["priority"];
      const weight = (alertBase[priority] ?? 3) + (escalated ? 3 : 0) + (dueSoon ? 2 : 0) + (!item.acknowledgedAt ? 1 : 0);
      items.push({
        key: `alert-${item.id}`,
        kind: "alert",
        id: item.id,
        title: item.title,
        detail: item.detail,
        priority,
        accountName: item.accountName,
        ownerUserId: item.assignedUserId,
        ownerName: item.assignedName,
        ownerEmail: item.assignedEmail,
        weight,
        escalated,
        dueSoon,
        slaRemainingMinutes: remaining,
        acknowledged: Boolean(item.acknowledgedAt),
        status: item.acknowledgedAt ? "acknowledged" : "unacknowledged",
      });
    }

    for (const task of tasks.filter((row) => row.sourceActive && row.status !== "resolved")) {
      const priority = (new Set(["critical", "high", "medium"]).has(task.priority) ? task.priority : "high") as LoadItem["priority"];
      const weight = (taskBase[priority] ?? 2) + (task.status === "in_progress" ? 1 : 0);
      items.push({
        key: `task-${task.id}`,
        kind: "task",
        id: task.id,
        title: task.title,
        detail: task.detail,
        priority,
        accountName: task.bankAccountId ? `Conta #${task.bankAccountId}` : "Tesouraria consolidada",
        ownerUserId: task.assignedUserId,
        ownerName: task.assignedName,
        ownerEmail: task.assignedEmail,
        weight,
        escalated: false,
        dueSoon: false,
        slaRemainingMinutes: null,
        acknowledged: true,
        status: task.status,
      });
    }

    const totalPoints = items.reduce((sum, item) => sum + item.weight, 0);
    const reference = users.length ? totalPoints / users.length : 0;
    const maxReference = Math.max(1, reference * 1.4, 8);

    const people: PersonLoad[] = users.map((user) => {
      const owned = items.filter((item) => item.ownerUserId === user.id || item.ownerEmail?.toLowerCase() === user.email.toLowerCase());
      const points = owned.reduce((sum, item) => sum + item.weight, 0);
      const escalated = owned.filter((item) => item.escalated).length;
      const critical = owned.filter((item) => item.priority === "critical").length;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        points,
        items: owned.length,
        alerts: owned.filter((item) => item.kind === "alert").length,
        tasks: owned.filter((item) => item.kind === "task").length,
        critical,
        escalated,
        dueSoon: owned.filter((item) => item.dueSoon).length,
        state: stateFor(points, reference, escalated, critical),
        utilizationPct: Math.round((points / maxReference) * 100),
      };
    }).sort((a, b) => b.points - a.points || b.escalated - a.escalated || a.name.localeCompare(b.name));

    const personMap = new Map(people.map((person) => [person.id, person]));
    const projected = new Map(people.map((person) => [person.id, person.points]));
    const suggestions: Array<{
      key: string;
      kind: ItemKind;
      itemId: number;
      itemTitle: string;
      priority: LoadItem["priority"];
      weight: number;
      escalated: boolean;
      dueSoon: boolean;
      fromUserId: number | null;
      fromName: string;
      toUserId: number;
      toName: string;
      reason: string;
    }> = [];

    function bestTarget(excludedUserId: number | null, weight: number) {
      const candidates = people
        .filter((person) => person.id !== excludedUserId)
        .map((person) => ({ person, projected: projected.get(person.id) ?? person.points }))
        .sort((a, b) => a.projected - b.projected || a.person.escalated - b.person.escalated || a.person.name.localeCompare(b.person.name));
      const safe = candidates.find((candidate) => stateFor(candidate.projected + weight, reference, candidate.person.escalated, candidate.person.critical) !== "overloaded");
      return safe ?? candidates[0] ?? null;
    }

    const unassigned = items.filter((item) => !item.ownerUserId && !item.ownerEmail).sort((a, b) => itemPriorityRank(a) - itemPriorityRank(b));
    for (const item of unassigned) {
      const target = bestTarget(null, item.weight);
      if (!target) break;
      suggestions.push({
        key: `assign-${item.key}-${target.person.id}`,
        kind: item.kind,
        itemId: item.id,
        itemTitle: item.title,
        priority: item.priority,
        weight: item.weight,
        escalated: item.escalated,
        dueSoon: item.dueSoon,
        fromUserId: null,
        fromName: "Sem responsável",
        toUserId: target.person.id,
        toName: target.person.name,
        reason: item.escalated || item.dueSoon
          ? "Item urgente sem responsável; direcionado para a menor carga projetada disponível."
          : "Item sem responsável; distribuição sugerida pela menor carga ponderada da equipe.",
      });
      projected.set(target.person.id, target.projected + item.weight);
      if (suggestions.length >= 10) break;
    }

    if (suggestions.length < 10) {
      for (const source of people.filter((person) => person.state === "overloaded")) {
        const owned = items
          .filter((item) => item.ownerUserId === source.id || item.ownerEmail?.toLowerCase() === source.email.toLowerCase())
          .sort((a, b) => {
            const protectedA = a.escalated || a.dueSoon ? 1 : 0;
            const protectedB = b.escalated || b.dueSoon ? 1 : 0;
            return protectedA - protectedB || b.weight - a.weight;
          });
        for (const item of owned) {
          const sourceProjected = projected.get(source.id) ?? source.points;
          if (sourceProjected <= Math.max(7, reference * 1.15)) break;
          const target = bestTarget(source.id, item.weight);
          if (!target) break;
          if (sourceProjected - target.projected < 3) continue;
          suggestions.push({
            key: `move-${item.key}-${source.id}-${target.person.id}`,
            kind: item.kind,
            itemId: item.id,
            itemTitle: item.title,
            priority: item.priority,
            weight: item.weight,
            escalated: item.escalated,
            dueSoon: item.dueSoon,
            fromUserId: source.id,
            fromName: source.name,
            toUserId: target.person.id,
            toName: target.person.name,
            reason: item.escalated || item.dueSoon
              ? "Redistribuição urgente: a origem está sobrecarregada e o destino tem menor carga projetada."
              : "Alivia uma pessoa sobrecarregada sem levar o destino para a faixa de sobrecarga, quando possível.",
          });
          projected.set(source.id, Math.max(0, sourceProjected - item.weight));
          projected.set(target.person.id, target.projected + item.weight);
          if (suggestions.length >= 10) break;
        }
        if (suggestions.length >= 10) break;
      }
    }

    const currentUser = people.find((person) => person.email.toLowerCase() === auth.email.toLowerCase()) ?? null;
    return Response.json({
      generatedAt: now,
      currentUser: currentUser ? { id: currentUser.id, email: auth.email } : { id: null, email: auth.email },
      referencePoints: Number(reference.toFixed(1)),
      thresholds: {
        overload: Number(Math.max(8, reference * 1.4).toFixed(1)),
        available: Number(Math.max(3, reference * 0.7).toFixed(1)),
      },
      people,
      items: items.sort((a, b) => itemPriorityRank(a) - itemPriorityRank(b)),
      suggestions,
      summary: {
        people: people.length,
        totalItems: items.length,
        totalPoints,
        overloaded: people.filter((person) => person.state === "overloaded").length,
        balanced: people.filter((person) => person.state === "balanced").length,
        available: people.filter((person) => person.state === "available").length,
        unassigned: unassigned.length,
        escalated: items.filter((item) => item.escalated).length,
        dueSoon: items.filter((item) => item.dueSoon).length,
        suggestions: suggestions.length,
      },
      methodology: {
        alertWeights: "Crítico 4 · Alto 3 · Médio 2 · +3 escalonado · +2 até 30 min do SLA · +1 sem ciência",
        taskWeights: "Crítica 3 · Alta 2 · Média 1 · +1 em andamento",
        note: "Carga ponderada é uma heurística operacional para distribuição; não é nota de produtividade nem medida de desempenho individual.",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível calcular a capacidade da Tesouraria." }, { status: 503 });
  }
}
