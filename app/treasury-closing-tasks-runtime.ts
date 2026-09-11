import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureOfficialTreasuryClosingTables } from "@/app/treasury-closing-lock";

export async function ensureTreasuryClosingTaskTables() {
  await ensureOfficialTreasuryClosingTables();
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_closing_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_key TEXT NOT NULL UNIQUE,
      scope TEXT NOT NULL DEFAULT 'account',
      bank_account_id INTEGER,
      issue_type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'high',
      affected_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_user_id INTEGER,
      assigned_name TEXT,
      assigned_email TEXT,
      source_active INTEGER NOT NULL DEFAULT 1,
      first_seen_date TEXT NOT NULL,
      last_seen_date TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_closing_tasks_status_priority ON treasury_closing_tasks(status, priority)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_closing_tasks_account ON treasury_closing_tasks(bank_account_id, status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_closing_tasks_assignee ON treasury_closing_tasks(assigned_user_id, status)`));
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_closing_task_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      performed_by TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES treasury_closing_tasks(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_closing_task_audit_task ON treasury_closing_task_audit(task_id, created_at)`));
}
