import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function ensureTreasuryTables() {
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      bank_name TEXT,
      account_type TEXT NOT NULL DEFAULT 'checking',
      agency TEXT,
      account_number TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      opening_date TEXT NOT NULL,
      current_balance REAL NOT NULL DEFAULT 0,
      balance_date TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_bank_accounts_active ON treasury_bank_accounts(active)`));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_movement_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      movement_type TEXT NOT NULL,
      movement_id INTEGER NOT NULL,
      bank_account_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_movement_account ON treasury_movement_accounts(movement_type, movement_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_movement_bank_account ON treasury_movement_accounts(bank_account_id)`));
}

export async function requireTreasuryAccess() {
  const { requirePermission } = await import("@/app/authorization");
  const receivablesDenied = await requirePermission("receivables");
  if (receivablesDenied) return receivablesDenied;
  return requirePermission("payables");
}
