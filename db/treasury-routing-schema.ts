import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
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
