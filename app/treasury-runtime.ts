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
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_statement_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      transaction_count INTEGER NOT NULL DEFAULT 0,
      imported_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_statement_import_hash ON treasury_statement_imports(bank_account_id, content_hash)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_statement_import_account ON treasury_statement_imports(bank_account_id, created_at)`));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_statement_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL,
      bank_account_id INTEGER NOT NULL,
      external_id TEXT,
      transaction_date TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      memo TEXT,
      document TEXT,
      balance REAL,
      matched_movement_type TEXT,
      matched_movement_id INTEGER,
      matched_at TEXT,
      matched_by TEXT,
      match_method TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (import_id) REFERENCES treasury_statement_imports(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS uq_treasury_statement_external ON treasury_statement_transactions(import_id, external_id)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_statement_transaction_account_date ON treasury_statement_transactions(bank_account_id, transaction_date)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_statement_transaction_match ON treasury_statement_transactions(matched_movement_type, matched_movement_id)`));
}

export async function requireTreasuryAccess() {
  const { requirePermission } = await import("@/app/authorization");
  const receivablesDenied = await requirePermission("receivables");
  if (receivablesDenied) return receivablesDenied;
  return requirePermission("payables");
}
