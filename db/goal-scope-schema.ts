import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { companies, goals } from "./schema";

export const goalFinancialScopes = sqliteTable(
  "goal_financial_scopes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    goalId: integer("goal_id")
      .notNull()
      .unique()
      .references(() => goals.id, { onDelete: "cascade" }),
    companyId: integer("company_id").references(() => companies.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_goal_financial_scopes_company").on(table.companyId)],
);
