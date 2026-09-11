import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const treasuryCapacityRoutingSettings = sqliteTable("treasury_capacity_routing_settings", {
  id: integer("id").primaryKey(),
  autoAssignmentEnabled: integer("auto_assignment_enabled", { mode: "boolean" }).notNull().default(false),
  minimumSkillLevel: integer("minimum_skill_level").notNull().default(2),
  updatedBy: text("updated_by"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
