import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";

export const treasuryRoutingProfiles = sqliteTable(
  "treasury_routing_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    availability: text("availability").notNull().default("available"),
    availabilityUntil: text("availability_until"),
    notes: text("notes"),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_treasury_routing_profile_user").on(table.userId),
    index("idx_treasury_routing_profile_availability").on(table.availability),
  ],
);

export const treasuryRoutingSkills = sqliteTable(
  "treasury_routing_skills",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    level: integer("level").notNull().default(2),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_treasury_routing_skill_user_domain").on(table.userId, table.domain),
    index("idx_treasury_routing_skill_domain_level").on(table.domain, table.level),
  ],
);

export const treasuryRoutingProfileAudit = sqliteTable(
  "treasury_routing_profile_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    performedBy: text("performed_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_treasury_routing_profile_audit_user").on(table.userId, table.createdAt)],
);

export const treasuryRoutingSchedules = sqliteTable(
  "treasury_routing_schedules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scheduleType: text("schedule_type").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    coverageUserId: integer("coverage_user_id").references(() => users.id, { onDelete: "set null" }),
    notes: text("notes"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_treasury_routing_schedule_user_dates").on(table.userId, table.startDate, table.endDate),
    index("idx_treasury_routing_schedule_active_dates").on(table.active, table.startDate, table.endDate),
    index("idx_treasury_routing_schedule_coverage").on(table.coverageUserId, table.active),
  ],
);

export const treasuryRoutingScheduleAudit = sqliteTable(
  "treasury_routing_schedule_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scheduleId: integer("schedule_id").references(() => treasuryRoutingSchedules.id, { onDelete: "set null" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    performedBy: text("performed_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_treasury_routing_schedule_audit_schedule").on(table.scheduleId, table.createdAt),
    index("idx_treasury_routing_schedule_audit_user").on(table.userId, table.createdAt),
  ],
);

export const treasuryCapacityAlertSettings = sqliteTable("treasury_capacity_alert_settings", {
  id: integer("id").primaryKey(),
  lookaheadDays: integer("lookahead_days").notNull().default(7),
  lowCapacityThresholdPct: real("low_capacity_threshold_pct").notNull().default(70),
  uncoveredEnabled: integer("uncovered_enabled", { mode: "boolean" }).notNull().default(true),
  singlePointEnabled: integer("single_point_enabled", { mode: "boolean" }).notNull().default(true),
  absenceWithoutCoverageEnabled: integer("absence_without_coverage_enabled", { mode: "boolean" }).notNull().default(true),
  lowCapacityEnabled: integer("low_capacity_enabled", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const treasuryCapacityAlertOccurrences = sqliteTable(
  "treasury_capacity_alert_occurrences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    alertKey: text("alert_key").notNull(),
    alertType: text("alert_type").notNull(),
    severity: text("severity").notNull(),
    riskDate: text("risk_date").notNull(),
    domain: text("domain"),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    status: text("status").notNull().default("active"),
    firstSeenAt: text("first_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    acknowledgedBy: text("acknowledged_by"),
    acknowledgedAt: text("acknowledged_at"),
    acknowledgementNote: text("acknowledgement_note"),
    resolvedAt: text("resolved_at"),
    resolutionReason: text("resolution_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_treasury_capacity_alert_key_status").on(table.alertKey, table.status),
    index("idx_treasury_capacity_alert_status_severity").on(table.status, table.severity),
    index("idx_treasury_capacity_alert_risk_date").on(table.riskDate, table.status),
  ],
);

export const treasuryCapacityAlertAudit = sqliteTable(
  "treasury_capacity_alert_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    occurrenceId: integer("occurrence_id").notNull().references(() => treasuryCapacityAlertOccurrences.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    performedBy: text("performed_by").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_treasury_capacity_alert_audit_occurrence").on(table.occurrenceId, table.createdAt)],
);
