import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { GET as getExecutiveAlerts } from "@/app/api/treasury-executive-alerts/route";
import { ensureTreasuryAlertSettings } from "@/app/treasury-executive-alerts-runtime";
import { assignDefaultOnEscalation, listTreasuryAlertUsers } from "@/app/treasury-alert-assignment";
import {
  listTreasuryRoutingProfiles,
  routingDomainForAlertType,
  routingDomainForTaskIssueType,
  treasurySkillLabels,
  type TreasuryAvailability,
  type TreasuryRoutingDomain,
} from "@/app/treasury-routing-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import { treasuryAlertOccurrences, treasuryAlertSettings, treasuryClosingTasks } from "@/db/treasury-closing-schema";

type CapacityState = "available" | "balanced" | "overloaded";
type ItemKind = "alert" | "task";
type SkillMap = Record<TreasuryRoutingDomain, number>;

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
  domain: TreasuryRoutingDomain;
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
  availability: TreasuryAvailability;
  baseAvailability: TreasuryAvailability;
  availabilityUntil: string | null;
  skills: SkillMap;
  capacityFactor: number;
  activeScheduleId: number | null;
  activeScheduleType: string | null;
  coverageUserId: number | null;
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
function availabilityFactor(value: TreasuryAvailability) {
  if (value === "limited") return 0.6;
  if (value === "unavailable") return 0;
  return 1;
}
function availabilityRank(value: TreasuryAvailability) {
  return value === "available" ? 0 : value === "limited" ? 1 : 2;
}
function stateFor(points: number, reference: number, escalated: number, critical: number, factor = 1): CapacityState {
  const safeFactor = factor || 0.35;
  const overloadLine = Math.max(4, Math.max(8, reference * 1.4) * safeFactor);
  const availableLine = Math.max(2, Math.max(3, reference * 0.7) * safeFactor);
  if (escalated >= 2 || points >= overloadLine || (critical >= 3 && points >= 6 * safeFactor)) return "overloaded";
  if (escalated === 0 && points <= availableLine) return "available";
  return "balanced";
}
function itemPriorityRank(item: LoadItem) {
  const priority = item.priority === "critical" ? 0 : item.priority === "high" ? 1 : 2;
  return (item.escalated ? -100 : 0) + (item.dueSoon ? -50 : 0) + priority * 10 - item.weight;
}
function domainLabel(domain: TreasuryRoutingDomain) {
  if (domain === "cash") return "Caixa";
  if (domain === "critical_tasks") return "Pendências críticas";
  if (domain === "reconciliation") return "Conciliação";
  return "Fechamento";
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

    const users = await listTreasuryAlertUsers();
    const routingProfiles = await listTreasuryRoutingProfiles(users);
    const [occurrences, tasks] = await Promise.all([
      db.select().from(treasuryAlertOccurrences),
      db.select().from(treasuryClosingTasks),
    ]);
    const routingByUser = new Map(routingProfiles.map((row) => [row.id, row]));

    const items: LoadItem[] = [];
    for (const item of occurrences.filter((row) => row.status === "active")) {
      const ackLimit = item.severity === "critical" ? settings.criticalAckSlaMinutes : settings.highAckSlaMinutes;
      const dueAt = item.acknowledgedAt ? addMinutes(item.acknowledgedAt, settings.resolutionSlaMinutes) : addMinutes(item.firstSeenAt, ackLimit);
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
        domain: routingDomainForAlertType(item.alertType),
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
        domain: routingDomainForTaskIssueType(task.issueType),
      });
    }

    const totalPoints = items.reduce((sum, item) => sum + item.weight, 0);
    const totalCapacityFactor = routingProfiles.reduce((sum, row) => sum + availabilityFactor(row.effectiveAvailability), 0);
    const reference = totalCapacityFactor > 0 ? totalPoints / totalCapacityFactor : totalPoints;
    const maxReference = Math.max(1, reference * 1.4, 8);

    const people: PersonLoad[] = users.map((user) => {
      const routing = routingByUser.get(user.id)!;
      const effective = routing.effectiveAvailability;
      const factor = availabilityFactor(effective);
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
        state: stateFor(points, reference, escalated, critical, factor),
        utilizationPct: factor > 0 ? Math.round((points / (maxReference * factor)) * 100) : points ? 100 : 0,
        availability: effective,
        baseAvailability: routing.availability,
        availabilityUntil: routing.availabilityUntil,
        skills: routing.skills,
        capacityFactor: factor,
        activeScheduleId: routing.activeSchedule?.id ?? null,
        activeScheduleType: routing.activeSchedule?.scheduleType ?? null,
        coverageUserId: routing.coverageUserId,
      };
    }).sort((a, b) => b.points - a.points || b.escalated - a.escalated || a.name.localeCompare(b.name));

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
      domain: TreasuryRoutingDomain;
      targetSkillLevel: number;
      targetAvailability: TreasuryAvailability;
    }> = [];
    const routingGaps: LoadItem[] = [];

    function bestTarget(excludedUserId: number | null, item: LoadItem) {
      const coverageUserId = excludedUserId ? routingByUser.get(excludedUserId)?.coverageUserId ?? null : null;
      const candidates = people
        .filter((person) => person.id !== excludedUserId && person.availability !== "unavailable" && Number(person.skills[item.domain] ?? 0) > 0)
        .map((person) => ({
          person,
          skill: Number(person.skills[item.domain] ?? 0),
          projected: projected.get(person.id) ?? person.points,
          normalized: (projected.get(person.id) ?? person.points) / Math.max(0.35, person.capacityFactor),
          coveragePriority: coverageUserId === person.id ? 0 : 1,
        }))
        .sort((a, b) =>
          a.coveragePriority - b.coveragePriority
          || availabilityRank(a.person.availability) - availabilityRank(b.person.availability)
          || b.skill - a.skill
          || a.normalized - b.normalized
          || (a.person.escalated + a.person.dueSoon) - (b.person.escalated + b.person.dueSoon)
          || a.person.name.localeCompare(b.person.name)
        );
      if (!candidates.length) return null;
      const safe = candidates.find((candidate) => stateFor(candidate.projected + item.weight, reference, candidate.person.escalated, candidate.person.critical, candidate.person.capacityFactor) !== "overloaded");
      return safe ?? candidates[0];
    }

    const unassigned = items.filter((item) => !item.ownerUserId && !item.ownerEmail).sort((a, b) => itemPriorityRank(a) - itemPriorityRank(b));
    for (const item of unassigned) {
      const target = bestTarget(null, item);
      if (!target) {
        routingGaps.push(item);
        continue;
      }
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
        domain: item.domain,
        targetSkillLevel: target.skill,
        targetAvailability: target.person.availability,
        reason: `${treasurySkillLabels[target.skill]} em ${domainLabel(item.domain)}; ${target.person.availability === "limited" ? "disponibilidade efetiva limitada" : "disponível"} e menor carga compatível entre os candidatos elegíveis.`,
      });
      projected.set(target.person.id, target.projected + item.weight);
      if (suggestions.length >= 10) break;
    }

    if (suggestions.length < 10) {
      for (const source of people.filter((person) => person.state === "overloaded" || person.availability === "unavailable")) {
        const owned = items
          .filter((item) => item.ownerUserId === source.id || item.ownerEmail?.toLowerCase() === source.email.toLowerCase())
          .sort((a, b) => {
            const protectedA = a.escalated || a.dueSoon ? 1 : 0;
            const protectedB = b.escalated || b.dueSoon ? 1 : 0;
            return protectedA - protectedB || b.weight - a.weight;
          });
        for (const item of owned) {
          const sourceProjected = projected.get(source.id) ?? source.points;
          if (source.availability !== "unavailable" && sourceProjected <= Math.max(7, reference * 1.15 * Math.max(.6, source.capacityFactor))) break;
          const target = bestTarget(source.id, item);
          if (!target) {
            if (!routingGaps.some((gap) => gap.key === item.key)) routingGaps.push(item);
            continue;
          }
          if (source.availability !== "unavailable" && sourceProjected - target.projected < 3) continue;
          const isCoverage = source.coverageUserId === target.person.id;
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
            domain: item.domain,
            targetSkillLevel: target.skill,
            targetAvailability: target.person.availability,
            reason: isCoverage
              ? `${target.person.name} é a cobertura temporária cadastrada para ${source.name}, está elegível em ${domainLabel(item.domain)} e recebe prioridade na redistribuição.`
              : source.availability === "unavailable"
                ? `${source.name} está indisponível pela disponibilidade efetiva/escala. ${target.person.name} é ${treasurySkillLabels[target.skill].toLowerCase()} na competência exigida e está elegível.`
                : `Alivia uma pessoa sobrecarregada e direciona para ${treasurySkillLabels[target.skill].toLowerCase()} na competência exigida, priorizando disponibilidade efetiva e menor carga normalizada.`,
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
      routingGaps: routingGaps.map((item) => ({ key: item.key, title: item.title, domain: item.domain, priority: item.priority })),
      summary: {
        people: people.length,
        totalItems: items.length,
        totalPoints,
        overloaded: people.filter((person) => person.state === "overloaded").length,
        balanced: people.filter((person) => person.state === "balanced").length,
        available: people.filter((person) => person.state === "available" && person.availability !== "unavailable").length,
        unassigned: unassigned.length,
        escalated: items.filter((item) => item.escalated).length,
        dueSoon: items.filter((item) => item.dueSoon).length,
        suggestions: suggestions.length,
        unavailablePeople: people.filter((person) => person.availability === "unavailable").length,
        limitedPeople: people.filter((person) => person.availability === "limited").length,
        routingGaps: routingGaps.length,
        scheduledPeople: people.filter((person) => person.activeScheduleId).length,
      },
      methodology: {
        alertWeights: "Crítico 4 · Alto 3 · Médio 2 · +3 escalonado · +2 até 30 min do SLA · +1 sem ciência",
        taskWeights: "Crítica 3 · Alta 2 · Média 1 · +1 em andamento",
        note: "Disponibilidade efetiva combina perfil-base e escalas programadas. Coberturas temporárias têm prioridade quando elegíveis; depois entram competência, disponibilidade, carga e risco de SLA. A carga ponderada é heurística operacional, não nota de desempenho.",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível calcular a capacidade da Tesouraria." }, { status: 503 });
  }
}
