import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { companies } from "./schema";

export const serviceCallSlaPolicies = sqliteTable(
  "service_call_sla_policies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    companyId: integer("company_id").references(() => companies.id),
    priority: text("priority"),
    serviceType: text("service_type"),
    actionMinutes: integer("action_minutes"),
    attendanceMinutes: integer("attendance_minutes"),
    targetMinutes: integer("target_minutes").notNull(),
    pausePending: integer("pause_pending", { mode: "boolean" })
      .notNull()
      .default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_service_call_sla_company").on(table.companyId),
    index("idx_service_call_sla_priority").on(table.priority),
    index("idx_service_call_sla_service_type").on(table.serviceType),
    index("idx_service_call_sla_active").on(table.active),
  ],
);
