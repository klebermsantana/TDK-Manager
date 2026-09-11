import { and, asc, desc, eq, sql } from "drizzle-orm";
import { todaySaoPaulo } from "@/app/financial-ledger";
import { getDb } from "@/db";
import {
  treasuryRoutingProfileAudit,
  treasuryRoutingProfiles,
  treasuryRoutingScheduleAudit,
  treasuryRoutingSchedules,
  treasuryRoutingSkills,
} from "@/db/treasury-routing-schema";

export const treasuryRoutingDomains = ["cash", "critical_tasks", "reconciliation", "closing"] as const;
export type TreasuryRoutingDomain = (typeof treasuryRoutingDomains)[number];
export type TreasuryAvailability = "available" | "limited" | "unavailable";
export const treasuryScheduleTypes = ["vacation", "day_off", "reduced_hours", "temporary_unavailability"] as const;
export type TreasuryScheduleType = (typeof treasuryScheduleTypes)[number];

export const treasuryRoutingDomainLabels: Record<TreasuryRoutingDomain, string> = {
  cash: "Caixa",
  critical_tasks: "Pendências críticas",
  reconciliation: "Conciliação",
  closing: "Fechamento",
};

export const treasurySkillLabels: Record<number, string> = {
  0: "Sem competência",
  1: "Apoio",
  2: "Habilitado",
  3: "Especialista",
};

export const treasuryScheduleTypeLabels: Record<TreasuryScheduleType, string> = {
  vacation: "Férias",
  day_off: "Folga",
  reduced_hours: "Horário reduzido",
  temporary_unavailability: "Indisponibilidade temporária",
};

export function routingDomainForAlertType(alertType: string): TreasuryRoutingDomain {
  if (alertType === "negative_forecast") return "cash";
  if (alertType === "reconciliation") return "reconciliation";
  if (alertType === "closing_overdue") return "closing";
  return "critical_tasks";
}

export function routingDomainForTaskIssueType(issueType: string): TreasuryRoutingDomain {
  if (["statement_missing", "statement_outdated", "unallocated_statement", "ledger_unassigned"].includes(issueType)) return "reconciliation";
  if (["balance_difference", "base_anchor", "statement_balance_missing"].includes(issueType)) return "closing";
  return "critical_tasks";
}

function saoPauloClock(at = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const values = Object.fromEntries(formatter.formatToParts(at).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function availabilityRank(value: TreasuryAvailability) {
  return value === "unavailable" ? 2 : value === "limited" ? 1 : 0;
}

function strongestAvailability(a: TreasuryAvailability, b: TreasuryAvailability): TreasuryAvailability {
  return availabilityRank(a) >= availabilityRank(b) ? a : b;
}

function withinDailyWindow(time: string, start: string, end: string) {
  if (start <= end) return time >= start && time <= end;
  return time >= start || time <= end;
}

function scheduleEffectiveAvailability(schedule: typeof treasuryRoutingSchedules.$inferSelect, localTime: string): TreasuryAvailability {
  if (schedule.scheduleType === "reduced_hours") {
    if (!schedule.startTime || !schedule.endTime) return "limited";
    return withinDailyWindow(localTime, schedule.startTime, schedule.endTime) ? "limited" : "unavailable";
  }
  return "unavailable";
}

export async function ensureTreasuryRoutingTables() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_routing_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      availability TEXT NOT NULL DEFAULT 'available',
      availability_until TEXT,
      notes TEXT,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_routing_profile_user ON treasury_routing_profiles(user_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_routing_profile_availability ON treasury_routing_profiles(availability)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_routing_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      domain TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 2,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_routing_skill_user_domain ON treasury_routing_skills(user_id, domain)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_routing_skill_domain_level ON treasury_routing_skills(domain, level)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_routing_profile_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      performed_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_routing_profile_audit_user ON treasury_routing_profile_audit(user_id, created_at)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_routing_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      schedule_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      coverage_user_id INTEGER,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (coverage_user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_routing_schedule_user_dates ON treasury_routing_schedules(user_id, start_date, end_date)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_routing_schedule_active_dates ON treasury_routing_schedules(active, start_date, end_date)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_routing_schedule_coverage ON treasury_routing_schedules(coverage_user_id, active)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_routing_schedule_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      performed_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES treasury_routing_schedules(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_routing_schedule_audit_schedule ON treasury_routing_schedule_audit(schedule_id, created_at)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_routing_schedule_audit_user ON treasury_routing_schedule_audit(user_id, created_at)`));
}

export async function ensureTreasuryRoutingUsers(users: Array<{ id: number }>) {
  await ensureTreasuryRoutingTables();
  const db = getDb();
  const now = new Date().toISOString();
  for (const user of users) {
    await db.insert(treasuryRoutingProfiles).values({
      userId: user.id,
      availability: "available",
      updatedBy: "system",
      updatedAt: now,
    }).onConflictDoNothing();
    for (const domain of treasuryRoutingDomains) {
      await db.insert(treasuryRoutingSkills).values({
        userId: user.id,
        domain,
        level: 2,
        updatedBy: "system",
        updatedAt: now,
      }).onConflictDoNothing();
    }
  }
  await normalizeExpiredTreasuryAvailability();
}

export async function normalizeExpiredTreasuryAvailability() {
  await ensureTreasuryRoutingTables();
  const db = getDb();
  const today = todaySaoPaulo();
  const profiles = await db.select().from(treasuryRoutingProfiles).orderBy(asc(treasuryRoutingProfiles.id));
  for (const profile of profiles) {
    if (profile.availability === "available" || !profile.availabilityUntil || profile.availabilityUntil >= today) continue;
    const before = JSON.stringify(profile);
    const now = new Date().toISOString();
    const [updated] = await db.update(treasuryRoutingProfiles).set({
      availability: "available",
      availabilityUntil: null,
      updatedBy: "system",
      updatedAt: now,
    }).where(eq(treasuryRoutingProfiles.id, profile.id)).returning();
    await db.insert(treasuryRoutingProfileAudit).values({
      userId: profile.userId,
      action: "availability_expired",
      beforeJson: before,
      afterJson: JSON.stringify(updated),
      performedBy: "system",
    });
  }
}

async function effectiveScheduleForUser(userId: number, at = new Date()) {
  await ensureTreasuryRoutingTables();
  const clock = saoPauloClock(at);
  const rows = (await getDb().select().from(treasuryRoutingSchedules))
    .filter((row) => row.userId === userId && row.active && row.startDate <= clock.date && row.endDate >= clock.date);
  let effective: TreasuryAvailability = "available";
  let strongest: typeof treasuryRoutingSchedules.$inferSelect | null = null;
  for (const row of rows) {
    const rowAvailability = scheduleEffectiveAvailability(row, clock.time);
    if (!strongest || availabilityRank(rowAvailability) > availabilityRank(effective)) {
      effective = rowAvailability;
      strongest = row;
    } else if (!strongest) {
      strongest = row;
    }
  }
  return { availability: effective, schedule: strongest, activeSchedules: rows, localDate: clock.date, localTime: clock.time };
}

export async function getTreasuryRoutingSnapshot(userId: number, at = new Date()) {
  await ensureTreasuryRoutingTables();
  const db = getDb();
  const [profile] = await db.select().from(treasuryRoutingProfiles).where(eq(treasuryRoutingProfiles.userId, userId)).limit(1);
  const skillRows = await db.select().from(treasuryRoutingSkills).where(eq(treasuryRoutingSkills.userId, userId));
  const skills = Object.fromEntries(treasuryRoutingDomains.map((domain) => [domain, 0])) as Record<TreasuryRoutingDomain, number>;
  for (const row of skillRows) {
    if ((treasuryRoutingDomains as readonly string[]).includes(row.domain)) skills[row.domain as TreasuryRoutingDomain] = Number(row.level);
  }
  const baseAvailability = (profile?.availability ?? "available") as TreasuryAvailability;
  const scheduled = await effectiveScheduleForUser(userId, at);
  const effectiveAvailability = strongestAvailability(baseAvailability, scheduled.availability);
  return {
    userId,
    availability: baseAvailability,
    effectiveAvailability,
    availabilityUntil: profile?.availabilityUntil ?? null,
    notes: profile?.notes ?? null,
    skills,
    activeSchedule: scheduled.schedule,
    activeSchedules: scheduled.activeSchedules,
    coverageUserId: scheduled.schedule?.coverageUserId ?? null,
    effectiveSource: scheduled.schedule && availabilityRank(scheduled.availability) >= availabilityRank(baseAvailability) ? "schedule" as const : "profile" as const,
    localDate: scheduled.localDate,
    localTime: scheduled.localTime,
  };
}

export async function listTreasuryRoutingProfiles(users: Array<{ id: number; name: string; email: string; role: string }>) {
  await ensureTreasuryRoutingUsers(users);
  const db = getDb();
  const [profiles, skillRows, schedules] = await Promise.all([
    db.select().from(treasuryRoutingProfiles),
    db.select().from(treasuryRoutingSkills),
    db.select().from(treasuryRoutingSchedules),
  ]);
  const profileMap = new Map(profiles.map((row) => [row.userId, row]));
  const skillsByUser = new Map<number, Record<TreasuryRoutingDomain, number>>();
  for (const user of users) {
    skillsByUser.set(user.id, Object.fromEntries(treasuryRoutingDomains.map((domain) => [domain, 0])) as Record<TreasuryRoutingDomain, number>);
  }
  for (const row of skillRows) {
    if (!(treasuryRoutingDomains as readonly string[]).includes(row.domain)) continue;
    const skills = skillsByUser.get(row.userId);
    if (skills) skills[row.domain as TreasuryRoutingDomain] = Number(row.level);
  }
  const clock = saoPauloClock();
  return users.map((user) => {
    const profile = profileMap.get(user.id);
    const baseAvailability = (profile?.availability ?? "available") as TreasuryAvailability;
    const activeSchedules = schedules.filter((row) => row.userId === user.id && row.active && row.startDate <= clock.date && row.endDate >= clock.date);
    let scheduledAvailability: TreasuryAvailability = "available";
    let activeSchedule: typeof treasuryRoutingSchedules.$inferSelect | null = null;
    for (const row of activeSchedules) {
      const candidate = scheduleEffectiveAvailability(row, clock.time);
      if (!activeSchedule || availabilityRank(candidate) > availabilityRank(scheduledAvailability)) {
        scheduledAvailability = candidate;
        activeSchedule = row;
      } else if (!activeSchedule) {
        activeSchedule = row;
      }
    }
    return {
      ...user,
      availability: baseAvailability,
      effectiveAvailability: strongestAvailability(baseAvailability, scheduledAvailability),
      availabilityUntil: profile?.availabilityUntil ?? null,
      notes: profile?.notes ?? null,
      updatedBy: profile?.updatedBy ?? null,
      updatedAt: profile?.updatedAt ?? null,
      skills: skillsByUser.get(user.id)!,
      activeSchedule,
      activeSchedules,
      coverageUserId: activeSchedule?.coverageUserId ?? null,
      effectiveSource: activeSchedule && availabilityRank(scheduledAvailability) >= availabilityRank(baseAvailability) ? "schedule" as const : "profile" as const,
    };
  });
}

export async function isTreasuryRoutingEligible(userId: number, domain: TreasuryRoutingDomain) {
  const snapshot = await getTreasuryRoutingSnapshot(userId);
  return snapshot.effectiveAvailability !== "unavailable" && Number(snapshot.skills[domain] ?? 0) > 0;
}

export async function saveTreasuryRoutingProfile(args: {
  userId: number;
  availability: TreasuryAvailability;
  availabilityUntil: string | null;
  notes: string | null;
  skills: Partial<Record<TreasuryRoutingDomain, number>>;
  performedBy: string;
}) {
  await ensureTreasuryRoutingUsers([{ id: args.userId }]);
  const db = getDb();
  const before = await getTreasuryRoutingSnapshot(args.userId);
  const now = new Date().toISOString();
  const availabilityUntil = args.availability === "available" ? null : args.availabilityUntil;
  await db.update(treasuryRoutingProfiles).set({
    availability: args.availability,
    availabilityUntil,
    notes: args.notes,
    updatedBy: args.performedBy,
    updatedAt: now,
  }).where(eq(treasuryRoutingProfiles.userId, args.userId));

  for (const domain of treasuryRoutingDomains) {
    if (args.skills[domain] === undefined) continue;
    const level = Math.max(0, Math.min(3, Number(args.skills[domain])));
    await db.update(treasuryRoutingSkills).set({
      level,
      updatedBy: args.performedBy,
      updatedAt: now,
    }).where(and(eq(treasuryRoutingSkills.userId, args.userId), eq(treasuryRoutingSkills.domain, domain)));
  }

  const after = await getTreasuryRoutingSnapshot(args.userId);
  await db.insert(treasuryRoutingProfileAudit).values({
    userId: args.userId,
    action: "profile_updated",
    beforeJson: JSON.stringify(before),
    afterJson: JSON.stringify(after),
    performedBy: args.performedBy,
  });
  return after;
}

export async function listTreasuryRoutingSchedules() {
  await ensureTreasuryRoutingTables();
  return getDb().select().from(treasuryRoutingSchedules)
    .orderBy(desc(treasuryRoutingSchedules.startDate), desc(treasuryRoutingSchedules.id));
}

export async function listTreasuryRoutingScheduleAudit(limit = 120) {
  await ensureTreasuryRoutingTables();
  return getDb().select().from(treasuryRoutingScheduleAudit)
    .orderBy(desc(treasuryRoutingScheduleAudit.createdAt), desc(treasuryRoutingScheduleAudit.id))
    .limit(limit);
}

export async function saveTreasuryRoutingSchedule(args: {
  id?: number | null;
  userId: number;
  scheduleType: TreasuryScheduleType;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  coverageUserId: number | null;
  notes: string | null;
  active: boolean;
  performedBy: string;
}) {
  await ensureTreasuryRoutingTables();
  const db = getDb();
  const now = new Date().toISOString();
  if (args.id) {
    const [existing] = await db.select().from(treasuryRoutingSchedules).where(eq(treasuryRoutingSchedules.id, args.id)).limit(1);
    if (!existing) throw new Error("Escala programada não encontrada.");
    const [updated] = await db.update(treasuryRoutingSchedules).set({
      userId: args.userId,
      scheduleType: args.scheduleType,
      startDate: args.startDate,
      endDate: args.endDate,
      startTime: args.startTime,
      endTime: args.endTime,
      coverageUserId: args.coverageUserId,
      notes: args.notes,
      active: args.active,
      updatedBy: args.performedBy,
      updatedAt: now,
    }).where(eq(treasuryRoutingSchedules.id, args.id)).returning();
    await db.insert(treasuryRoutingScheduleAudit).values({
      scheduleId: existing.id,
      userId: args.userId,
      action: args.active ? "schedule_updated" : "schedule_cancelled",
      beforeJson: JSON.stringify(existing),
      afterJson: JSON.stringify(updated),
      performedBy: args.performedBy,
    });
    return updated;
  }
  const [created] = await db.insert(treasuryRoutingSchedules).values({
    userId: args.userId,
    scheduleType: args.scheduleType,
    startDate: args.startDate,
    endDate: args.endDate,
    startTime: args.startTime,
    endTime: args.endTime,
    coverageUserId: args.coverageUserId,
    notes: args.notes,
    active: args.active,
    createdBy: args.performedBy,
    updatedBy: args.performedBy,
    updatedAt: now,
  }).returning();
  await db.insert(treasuryRoutingScheduleAudit).values({
    scheduleId: created.id,
    userId: args.userId,
    action: "schedule_created",
    beforeJson: null,
    afterJson: JSON.stringify(created),
    performedBy: args.performedBy,
  });
  return created;
}
