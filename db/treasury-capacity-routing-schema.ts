import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./schema";
import { treasuryCapacityAlertOccurrences } from "./treasury-routing-schema";

export const treasuryCapacityRoutingSettings = sqliteTable("treasury_capacity_routing_settings", {
  id: integer("id").primaryKey(),
  autoAssignmentEnabled: integer("auto_assignment_enabled", { mode: "boolean" }).notNull().default(false),
  minimumSkillLevel: integer("minimum_skill_level").notNull().default(2),
  feedbackLearningEnabled: integer("feedback_learning_enabled", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const treasuryCapacityRoutingFeedback = sqliteTable(
  "treasury_capacity_routing_feedback",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    occurrenceId: integer("occurrence_id").notNull().references(() => treasuryCapacityAlertOccurrences.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    candidateName: text("candidate_name").notNull(),
    candidateEmail: text("candidate_email").notNull(),
    alertType: text("alert_type").notNull(),
    domain: text("domain"),
    feedback: text("feedback").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note"),
    candidateScore: real("candidate_score"),
    performedBy: text("performed_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_treasury_capacity_routing_feedback_once").on(table.occurrenceId, table.userId, table.performedBy),
    index("idx_treasury_capacity_routing_feedback_user_context").on(table.userId, table.domain, table.alertType),
    index("idx_treasury_capacity_routing_feedback_created").on(table.createdAt),
  ],
);
