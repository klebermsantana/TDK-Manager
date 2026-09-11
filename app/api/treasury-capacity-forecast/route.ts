import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { todaySaoPaulo } from "@/app/financial-ledger";
import { listTreasuryAlertUsers } from "@/app/treasury-alert-assignment";
import {
  ensureTreasuryRoutingUsers,
  treasuryRoutingDomainLabels,
  treasuryRoutingDomains,
  type TreasuryAvailability,
  type TreasuryRoutingDomain,
} from "@/app/treasury-routing-runtime";
import { requireTreasuryAccess } from "@/app/treasury-runtime";
import { getDb } from "@/db";
import {
  treasuryAlertOccurrences,
  treasuryAlertSettings,
  treasuryClosingTasks,
} from "@/db/treasury-closing-schema";
import {
  treasuryRoutingProfiles,
  treasuryRoutingSchedules,
  treasuryRoutingSkills,
} from "@/db/treasury-routing-schema";

type Risk = "controlled" | "warning" | "high" | "critical";
type SkillMap = Record<TreasuryRoutingDomain, number>;

const minuteMs = 60_000;
const allowedHorizons = new Set([7, 15, 30]);
const riskRank: Record<Risk, number> = { controlled: 0, warning: 1, high: 2, critical: 3 };

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isBusinessDay(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

function availabilityFactor(value: TreasuryAvailability) {
  if (value === "limited") return 0.6;
  if (value === "unavailable") return 0;
  return 1;
}

function availabilityRank(value: TreasuryAvailability) {
  return value === "unavailable" ? 2 : value === "limited" ? 1 : 0;
}

function strongestAvailability(a: TreasuryAvailability, b: TreasuryAvailability): TreasuryAvailability {
  return availabilityRank(a) >= availabilityRank(b) ? a : b;
}

function baseAvailabilityForDate(
  profile: typeof treasuryRoutingProfiles.$inferSelect | undefined,
  date: string,
): TreasuryAvailability {
  const value = (profile?.availability ?? "available") as TreasuryAvailability;
  if (value === "available") return value;
  if (!profile?.availabilityUntil) return value;
  return date <= profile.availabilityUntil ? value : "available";
}

function scheduledAvailability(
  rows: Array<typeof treasuryRoutingSchedules.$inferSelect>,
): TreasuryAvailability {
  let result: TreasuryAvailability = "available";
  for (const row of rows) {
    const value: TreasuryAvailability = row.scheduleType === "reduced_hours" ? "limited" : "unavailable";
    result = strongestAvailability(result, value);
  }
  return result;
}

function addMinutes(value: string, minutes: number) {
  return new Date(new Date(value).getTime() + minutes * minuteMs).toISOString();
}

function minutesUntil(value: string, now: string) {
  return Math.ceil((new Date(value).getTime() - new Date(now).getTime()) / minuteMs);
}

function riskMax(a: Risk, b: Risk): Risk {
  return riskRank[a] >= riskRank[b] ? a : b;
}

export async function GET(request: Request) {
  const denied = await requireTreasuryAccess();
  if (denied) return denied;
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Sessão não autenticada." }, { status: 401 });

  try {
    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("horizon") ?? 15);
    const horizon = allowedHorizons.has(requested) ? requested : 15;
    const today = todaySaoPaulo();
    const endDate = addDays(today, horizon - 1);
    const now = new Date().toISOString();

    const users = await listTreasuryAlertUsers();
    await ensureTreasuryRoutingUsers(users);
    const db = getDb();

    const [profiles, skillRows, schedules, occurrences, tasks, settingsRows] = await Promise.all([
      db.select().from(treasuryRoutingProfiles),
      db.select().from(treasuryRoutingSkills),
      db.select().from(treasuryRoutingSchedules),
      db.select().from(treasuryAlertOccurrences),
      db.select().from(treasuryClosingTasks),
      db.select().from(treasuryAlertSettings).where(eq(treasuryAlertSettings.id, 1)).limit(1),
    ]);

    const settings = settingsRows[0] ?? null;
    const profileByUser = new Map(profiles.map((row) => [row.userId, row]));
    const skillsByUser = new Map<number, SkillMap>();
    for (const user of users) {
      skillsByUser.set(
        user.id,
        Object.fromEntries(treasuryRoutingDomains.map((domain) => [domain, 0])) as SkillMap,
      );
    }
    for (const row of skillRows) {
      if (!(treasuryRoutingDomains as readonly string[]).includes(row.domain)) continue;
      const skills = skillsByUser.get(row.userId);
      if (skills) skills[row.domain as TreasuryRoutingDomain] = Number(row.level);
    }

    const configuredSpecialists = Object.fromEntries(
      treasuryRoutingDomains.map((domain) => [
        domain,
        users.filter((user) => Number(skillsByUser.get(user.id)?.[domain] ?? 0) === 3).length,
      ]),
    ) as Record<TreasuryRoutingDomain, number>;

    let currentLoadPoints = 0;
    for (const item of occurrences.filter((row) => row.status === "active")) {
      const severity = item.severity === "critical" ? 4 : item.severity === "high" ? 3 : 2;
      const escalated = item.ackEscalatedAt || item.resolutionEscalatedAt ? 3 : 0;
      let dueSoon = 0;
      if (settings) {
        const ackLimit = item.severity === "critical" ? settings.criticalAckSlaMinutes : settings.highAckSlaMinutes;
        const dueAt = item.acknowledgedAt
          ? addMinutes(item.acknowledgedAt, settings.resolutionSlaMinutes)
          : addMinutes(item.firstSeenAt, ackLimit);
        const remaining = minutesUntil(dueAt, now);
        dueSoon = remaining > 0 && remaining <= 30 ? 2 : 0;
      }
      currentLoadPoints += severity + escalated + dueSoon + (item.acknowledgedAt ? 0 : 1);
    }
    for (const task of tasks.filter((row) => row.sourceActive && row.status !== "resolved")) {
      currentLoadPoints += (task.priority === "critical" ? 3 : task.priority === "high" ? 2 : 1)
        + (task.status === "in_progress" ? 1 : 0);
    }

    const businessDates: string[] = [];
    for (let offset = 0; offset < horizon; offset += 1) {
      const date = addDays(today, offset);
      if (isBusinessDay(date)) businessDates.push(date);
    }

    const days = businessDates.map((date) => {
      const personStates = users.map((user) => {
        const profile = profileByUser.get(user.id);
        const baseAvailability = baseAvailabilityForDate(profile, date);
        const activeSchedules = schedules.filter((row) => (
          row.userId === user.id
          && row.active
          && row.startDate <= date
          && row.endDate >= date
        ));
        const scheduleAvailability = scheduledAvailability(activeSchedules);
        const effectiveAvailability = strongestAvailability(baseAvailability, scheduleAvailability);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          baseAvailability,
          effectiveAvailability,
          factor: availabilityFactor(effectiveAvailability),
          skills: skillsByUser.get(user.id)!,
          schedules: activeSchedules.map((row) => ({
            id: row.id,
            type: row.scheduleType,
            coverageUserId: row.coverageUserId,
            startTime: row.startTime,
            endTime: row.endTime,
          })),
        };
      });

      const effectiveCapacity = personStates.reduce((sum, row) => sum + row.factor, 0);
      const fullCapacity = Math.max(1, users.length);
      const capacityPct = Math.round((effectiveCapacity / fullCapacity) * 100);
      const unavailable = personStates.filter((row) => row.effectiveAvailability === "unavailable");
      const limited = personStates.filter((row) => row.effectiveAvailability === "limited");

      let dayRisk: Risk = capacityPct < 50 ? "critical" : capacityPct < 70 ? "high" : capacityPct < 85 ? "warning" : "controlled";
      const domains = treasuryRoutingDomains.map((domain) => {
        const eligible = personStates.filter((row) => row.effectiveAvailability !== "unavailable" && Number(row.skills[domain] ?? 0) > 0);
        const habilitated = eligible.filter((row) => Number(row.skills[domain] ?? 0) >= 2);
        const specialists = eligible.filter((row) => Number(row.skills[domain] ?? 0) === 3);
        const weightedCoverage = Number(eligible.reduce((sum, row) => sum + row.factor, 0).toFixed(1));
        const specialistGap = configuredSpecialists[domain] > 0 && specialists.length === 0;
        const uncovered = eligible.length === 0;
        const singlePoint = eligible.length === 1;
        const domainRisk: Risk = uncovered
          ? "critical"
          : singlePoint
            ? "high"
            : specialistGap || weightedCoverage < 1.5
              ? "warning"
              : "controlled";
        dayRisk = riskMax(dayRisk, domainRisk);
        return {
          domain,
          label: treasuryRoutingDomainLabels[domain],
          risk: domainRisk,
          eligible: eligible.length,
          habilitated: habilitated.length,
          specialists: specialists.length,
          configuredSpecialists: configuredSpecialists[domain],
          weightedCoverage,
          uncovered,
          singlePoint,
          specialistGap,
          people: eligible.map((row) => ({
            id: row.id,
            name: row.name,
            availability: row.effectiveAvailability,
            skill: row.skills[domain],
          })),
        };
      });

      const coverageRelations = personStates.flatMap((row) => row.schedules)
        .filter((row) => row.coverageUserId)
        .map((row) => {
          const source = personStates.find((person) => person.schedules.some((schedule) => schedule.id === row.id));
          const coverage = users.find((user) => user.id === row.coverageUserId);
          return {
            sourceUserId: source?.id ?? null,
            sourceName: source?.name ?? "Responsável",
            coverageUserId: row.coverageUserId!,
            coverageName: coverage?.name ?? `Usuário #${row.coverageUserId}`,
          };
        });

      return {
        date,
        risk: dayRisk,
        effectiveCapacity: Number(effectiveCapacity.toFixed(1)),
        fullCapacity: users.length,
        capacityPct,
        loadPerEffectivePerson: effectiveCapacity > 0 ? Number((currentLoadPoints / effectiveCapacity).toFixed(1)) : null,
        unavailable: unavailable.map((row) => ({ id: row.id, name: row.name })),
        limited: limited.map((row) => ({ id: row.id, name: row.name })),
        domains,
        coverageRelations,
      };
    });

    const attention = days.flatMap((day) => day.domains.flatMap((domain) => {
      const items: Array<{
        key: string;
        date: string;
        risk: Risk;
        title: string;
        detail: string;
        domain: TreasuryRoutingDomain;
      }> = [];
      if (domain.uncovered) {
        items.push({
          key: `${day.date}-${domain.domain}-uncovered`,
          date: day.date,
          risk: "critical",
          title: `${domain.label} sem cobertura`,
          detail: "Nenhuma pessoa elegível estará disponível para esta competência.",
          domain: domain.domain,
        });
      } else if (domain.singlePoint) {
        items.push({
          key: `${day.date}-${domain.domain}-single`,
          date: day.date,
          risk: "high",
          title: `${domain.label} com ponto único`,
          detail: `Somente ${domain.people[0]?.name ?? "uma pessoa"} estará elegível para esta competência.`,
          domain: domain.domain,
        });
      } else if (domain.specialistGap) {
        items.push({
          key: `${day.date}-${domain.domain}-specialist`,
          date: day.date,
          risk: "warning",
          title: `${domain.label} sem especialista presente`,
          detail: "Existe especialista cadastrado para a área, mas nenhum estará efetivamente disponível neste dia.",
          domain: domain.domain,
        });
      }
      return items;
    }));

    for (const day of days) {
      if (day.capacityPct < 70) {
        attention.push({
          key: `${day.date}-capacity`,
          date: day.date,
          risk: day.capacityPct < 50 ? "critical" : "high",
          title: "Capacidade geral reduzida",
          detail: `A equipe terá ${day.effectiveCapacity} de ${day.fullCapacity} FTE equivalentes disponíveis (${day.capacityPct}%).`,
          domain: "critical_tasks",
        });
      }
    }

    attention.sort((a, b) => riskRank[b.risk] - riskRank[a.risk] || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

    const absences = schedules
      .filter((row) => row.active && row.endDate >= today && row.startDate <= endDate)
      .map((row) => {
        const user = users.find((candidate) => candidate.id === row.userId);
        const coverage = row.coverageUserId ? users.find((candidate) => candidate.id === row.coverageUserId) : null;
        return {
          id: row.id,
          userId: row.userId,
          userName: user?.name ?? `Usuário #${row.userId}`,
          type: row.scheduleType,
          startDate: row.startDate,
          endDate: row.endDate,
          startTime: row.startTime,
          endTime: row.endTime,
          coverageUserId: row.coverageUserId,
          coverageName: coverage?.name ?? null,
          notes: row.notes,
        };
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.userName.localeCompare(b.userName));

    const criticalDays = days.filter((day) => day.risk === "critical").length;
    const highDays = days.filter((day) => day.risk === "high").length;
    const warningDays = days.filter((day) => day.risk === "warning").length;
    const lowestCapacityPct = days.length ? Math.min(...days.map((day) => day.capacityPct)) : 100;
    const uncoveredEvents = days.reduce((sum, day) => sum + day.domains.filter((domain) => domain.uncovered).length, 0);
    const singlePointEvents = days.reduce((sum, day) => sum + day.domains.filter((domain) => domain.singlePoint).length, 0);

    return Response.json({
      generatedAt: now,
      currentUser: { email: auth.email },
      horizon,
      today,
      endDate,
      currentLoadPoints,
      teamSize: users.length,
      days,
      attention: attention.slice(0, 30),
      absences,
      summary: {
        businessDays: days.length,
        criticalDays,
        highDays,
        warningDays,
        controlledDays: days.length - criticalDays - highDays - warningDays,
        lowestCapacityPct,
        uncoveredEvents,
        singlePointEvents,
        scheduledAbsences: absences.length,
        configuredSpecialists: Object.values(configuredSpecialists).reduce((sum, value) => sum + value, 0),
      },
      methodology: {
        note: "A previsão mede cobertura de pessoas/competências programadas; não prevê demanda futura. O indicador de pressão apenas reaplica a carga ativa atual sobre a capacidade futura equivalente.",
        businessDays: "Sábados e domingos ficam fora do risco operacional. Feriados ainda não são descontados.",
        thresholds: "Crítico: competência sem cobertura ou capacidade geral abaixo de 50%. Alto: ponto único ou capacidade abaixo de 70%. Atenção: especialista configurado ausente, cobertura ponderada baixa ou capacidade abaixo de 85%.",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível projetar a capacidade da Tesouraria." }, { status: 503 });
  }
}
