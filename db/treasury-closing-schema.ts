import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./schema";
import { treasuryBankAccounts } from "./treasury-schema";

export const treasuryClosingRecords = sqliteTable(
  "treasury_closing_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bankAccountId: integer("bank_account_id").notNull().references(() => treasuryBankAccounts.id, { onDelete: "cascade" }),
    closingDate: text("closing_date").notNull(),
    status: text("status").notNull().default("closed"),
    baseBalance: real("base_balance").notNull(),
    ledgerNet: real("ledger_net").notNull(),
    bookBalance: real("book_balance").notNull(),
    statementNet: real("statement_net").notNull(),
    statementBalance: real("statement_balance").notNull(),
    closingDifference: real("closing_difference").notNull().default(0),
    reconciliationCoverage: real("reconciliation_coverage").notNull().default(100),
    unallocatedAmount: real("unallocated_amount").notNull().default(0),
    ledgerEventCount: integer("ledger_event_count").notNull().default(0),
    statementTransactionCount: integer("statement_transaction_count").notNull().default(0),
    snapshotSource: text("snapshot_source").notNull().default("movement"),
    notes: text("notes"),
    closedBy: text("closed_by").notNull(),
    closedAt: text("closed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    reopenedBy: text("reopened_by"),
    reopenedAt: text("reopened_at"),
    reopenReason: text("reopen_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_treasury_closing_account_date").on(table.bankAccountId, table.closingDate),
    index("idx_treasury_closing_status_date").on(table.status, table.closingDate),
  ],
);

export const treasuryClosingAudit = sqliteTable(
  "treasury_closing_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    closingId: integer("closing_id").notNull().references(() => treasuryClosingRecords.id, { onDelete: "cascade" }),
    bankAccountId: integer("bank_account_id").notNull().references(() => treasuryBankAccounts.id, { onDelete: "cascade" }),
    closingDate: text("closing_date").notNull(),
    action: text("action").notNull(),
    performedBy: text("performed_by").notNull(),
    reason: text("reason"),
    snapshotJson: text("snapshot_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_treasury_closing_audit_closing").on(table.closingId, table.createdAt),
    index("idx_treasury_closing_audit_account").on(table.bankAccountId, table.createdAt),
  ],
);

export const treasuryClosingTasks = sqliteTable(
  "treasury_closing_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    issueKey: text("issue_key").notNull().unique(),
    scope: text("scope").notNull().default("account"),
    bankAccountId: integer("bank_account_id").references(() => treasuryBankAccounts.id, { onDelete: "cascade" }),
    issueType: text("issue_type").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    priority: text("priority").notNull().default("high"),
    affectedAmount: real("affected_amount").notNull().default(0),
    status: text("status").notNull().default("open"),
    assignedUserId: integer("assigned_user_id").references(() => users.id),
    assignedName: text("assigned_name"),
    assignedEmail: text("assigned_email"),
    sourceActive: integer("source_active", { mode: "boolean" }).notNull().default(true),
    firstSeenDate: text("first_seen_date").notNull(),
    lastSeenDate: text("last_seen_date").notNull(),
    resolvedAt: text("resolved_at"),
    resolvedBy: text("resolved_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_treasury_closing_tasks_status_priority").on(table.status, table.priority),
    index("idx_treasury_closing_tasks_account").on(table.bankAccountId, table.status),
    index("idx_treasury_closing_tasks_assignee").on(table.assignedUserId, table.status),
  ],
);

export const treasuryClosingTaskAudit = sqliteTable(
  "treasury_closing_task_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    taskId: integer("task_id").notNull().references(() => treasuryClosingTasks.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    performedBy: text("performed_by").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_treasury_closing_task_audit_task").on(table.taskId, table.createdAt),
  ],
);

export const treasuryAlertSettings = sqliteTable(
  "treasury_alert_settings",
  {
    id: integer("id").primaryKey(),
    forecastHorizonDays: integer("forecast_horizon_days").notNull().default(30),
    reconciliationMinPct: real("reconciliation_min_pct").notNull().default(95),
    closingCadence: text("closing_cadence").notNull().default("daily"),
    negativeForecastEnabled: integer("negative_forecast_enabled", { mode: "boolean" }).notNull().default(true),
    criticalTasksEnabled: integer("critical_tasks_enabled", { mode: "boolean" }).notNull().default(true),
    reconciliationEnabled: integer("reconciliation_enabled", { mode: "boolean" }).notNull().default(true),
    closingOverdueEnabled: integer("closing_overdue_enabled", { mode: "boolean" }).notNull().default(true),
    updatedBy: text("updated_by"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

export const treasuryAlertOccurrences = sqliteTable(
  "treasury_alert_occurrences",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    alertKey: text("alert_key").notNull(),
    alertType: text("alert_type").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    bankAccountId: integer("bank_account_id").references(() => treasuryBankAccounts.id, { onDelete: "set null" }),
    accountName: text("account_name").notNull(),
    amount: real("amount").notNull().default(0),
    metric: real("metric"),
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
    index("idx_treasury_alert_occurrence_key_status").on(table.alertKey, table.status),
    index("idx_treasury_alert_occurrence_status_severity").on(table.status, table.severity),
    index("idx_treasury_alert_occurrence_first_seen").on(table.firstSeenAt),
  ],
);

export const treasuryAlertOccurrenceAudit = sqliteTable(
  "treasury_alert_occurrence_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    occurrenceId: integer("occurrence_id").notNull().references(() => treasuryAlertOccurrences.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    performedBy: text("performed_by").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_treasury_alert_occurrence_audit_occurrence").on(table.occurrenceId, table.createdAt),
  ],
);
