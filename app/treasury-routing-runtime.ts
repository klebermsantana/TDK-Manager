import { and, asc, eq, sql } from "drizzle-orm";
import { todaySaoPaulo } from "@/app/financial-ledger";
import { getDb } from "@/db";
import {
  treasuryRoutingProfileAudit,
  treasuryRoutingProfiles,
  treasuryRoutingSkills,
} from "@/db/treasury-routing-schema";

export const treasuryRoutingDomains = ["cash", "critical_tasks", "reconciliation", "closing"] as const;
export type TreasuryRoutingDomain = (typeof treasuryRoutingDomains)[number];
export type TreasuryAvailability = "available" | "limited" | "unavailable";

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

export async function getTreasuryRoutingSnapshot(userId: number) {
  await ensureTreasuryRoutingTables();
  const db = getDb();
  const [profile] = await db.select().from(treasuryRoutingProfiles).where(eq(treasuryRoutingProfiles.userId, userId)).limit(1);
  const skillRows = await db.select().from(treasuryRoutingSkills).where(eq(treasuryRoutingSkills.userId, userId));
  const skills = Object.fromEntries(treasuryRoutingDomains.map((domain) => [domain, 0])) as Record<TreasuryRoutingDomain, number>;
  for (const row of skillRows) {
    if ((treasuryRoutingDomains as readonly string[]).includes(row.domain)) skills[row.domain as TreasuryRoutingDomain] = Number(row.level);
  }
  return {
    userId,
    availability: (profile?.availability ?? "available") as TreasuryAvailability,
    availabilityUntil: profile?.availabilityUntil ?? null,
    notes: profile?.notes ?? null,
    skills,
  };
}

export async function listTreasuryRoutingProfiles(users: Array<{ id: number; name: string; email: string; role: string }>) {
  await ensureTreasuryRoutingUsers(users);
  const db = getDb();
  const [profiles, skillRows] = await Promise.all([
    db.select().from(treasuryRoutingProfiles),
    db.select().from(treasuryRoutingSkills),
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
  return users.map((user) => {
    const profile = profileMap.get(user.id);
    return {
      ...user,
      availability: (profile?.availability ?? "available") as TreasuryAvailability,
      availabilityUntil: profile?.availabilityUntil ?? null,
      notes: profile?.notes ?? null,
      updatedBy: profile?.updatedBy ?? null,
      updatedAt: profile?.updatedAt ?? null,
      skills: skillsByUser.get(user.id)!,
    };
  });
}

export async function isTreasuryRoutingEligible(userId: number, domain: TreasuryRoutingDomain) {
  const snapshot = await getTreasuryRoutingSnapshot(userId);
  return snapshot.availability !== "unavailable" && Number(snapshot.skills[domain] ?? 0) > 0;
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
