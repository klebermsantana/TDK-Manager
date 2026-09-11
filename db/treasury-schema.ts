import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const treasuryBankAccounts = sqliteTable(
  "treasury_bank_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    bankName: text("bank_name"),
    accountType: text("account_type").notNull().default("checking"),
    agency: text("agency"),
    accountNumber: text("account_number"),
    openingBalance: real("opening_balance").notNull().default(0),
    openingDate: text("opening_date").notNull(),
    currentBalance: real("current_balance").notNull().default(0),
    balanceDate: text("balance_date").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_treasury_bank_accounts_active").on(table.active)],
);

export const treasuryMovementAccounts = sqliteTable(
  "treasury_movement_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    movementType: text("movement_type").notNull(),
    movementId: integer("movement_id").notNull(),
    bankAccountId: integer("bank_account_id").notNull().references(() => treasuryBankAccounts.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_treasury_movement_account").on(table.movementType, table.movementId),
    index("idx_treasury_movement_bank_account").on(table.bankAccountId),
  ],
);

export const treasuryStatementImports = sqliteTable(
  "treasury_statement_imports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bankAccountId: integer("bank_account_id").notNull().references(() => treasuryBankAccounts.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    contentHash: text("content_hash").notNull(),
    periodStart: text("period_start"),
    periodEnd: text("period_end"),
    transactionCount: integer("transaction_count").notNull().default(0),
    importedBy: text("imported_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_treasury_statement_import_hash").on(table.bankAccountId, table.contentHash),
    index("idx_treasury_statement_import_account").on(table.bankAccountId, table.createdAt),
  ],
);

export const treasuryStatementTransactions = sqliteTable(
  "treasury_statement_transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    importId: integer("import_id").notNull().references(() => treasuryStatementImports.id, { onDelete: "cascade" }),
    bankAccountId: integer("bank_account_id").notNull().references(() => treasuryBankAccounts.id, { onDelete: "cascade" }),
    externalId: text("external_id"),
    transactionDate: text("transaction_date").notNull(),
    amount: real("amount").notNull(),
    description: text("description").notNull(),
    memo: text("memo"),
    document: text("document"),
    balance: real("balance"),
    matchedMovementType: text("matched_movement_type"),
    matchedMovementId: integer("matched_movement_id"),
    matchedAt: text("matched_at"),
    matchedBy: text("matched_by"),
    matchMethod: text("match_method"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_treasury_statement_external").on(table.importId, table.externalId),
    index("idx_treasury_statement_transaction_account_date").on(table.bankAccountId, table.transactionDate),
    index("idx_treasury_statement_transaction_match").on(table.matchedMovementType, table.matchedMovementId),
  ],
);
