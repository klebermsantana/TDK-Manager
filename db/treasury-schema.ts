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
  (table) => [
    index("idx_treasury_bank_accounts_active").on(table.active),
  ],
);

export const treasuryMovementAccounts = sqliteTable(
  "treasury_movement_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    movementType: text("movement_type").notNull(),
    movementId: integer("movement_id").notNull(),
    bankAccountId: integer("bank_account_id")
      .notNull()
      .references(() => treasuryBankAccounts.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("uq_treasury_movement_account").on(table.movementType, table.movementId),
    index("idx_treasury_movement_bank_account").on(table.bankAccountId),
  ],
);
