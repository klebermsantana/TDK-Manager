import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
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
