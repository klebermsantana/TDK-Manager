import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { serviceCalls } from "./schema";

export const serviceCallFinancials = sqliteTable("service_call_financials", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceCallId: integer("service_call_id")
    .notNull()
    .unique()
    .references(() => serviceCalls.id),
  revenueAmount: real("revenue_amount"),
  notes: text("notes"),
  updatedBy: text("updated_by").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
