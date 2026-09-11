import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureTreasuryClosingTaskTables } from "@/app/treasury-closing-tasks-runtime";

export async function ensureTreasuryAlertSettings() {
  await ensureTreasuryClosingTaskTables();
  const db = getDb();
  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_alert_settings (
      id INTEGER PRIMARY KEY,
      forecast_horizon_days INTEGER NOT NULL DEFAULT 30,
      reconciliation_min_pct REAL NOT NULL DEFAULT 95,
      closing_cadence TEXT NOT NULL DEFAULT 'daily',
      negative_forecast_enabled INTEGER NOT NULL DEFAULT 1,
      critical_tasks_enabled INTEGER NOT NULL DEFAULT 1,
      reconciliation_enabled INTEGER NOT NULL DEFAULT 1,
      closing_overdue_enabled INTEGER NOT NULL DEFAULT 1,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_alert_settings (
      id, forecast_horizon_days, reconciliation_min_pct, closing_cadence,
      negative_forecast_enabled, critical_tasks_enabled, reconciliation_enabled, closing_overdue_enabled
    ) VALUES (1, 30, 95, 'daily', 1, 1, 1, 1)
  `));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_alert_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_key TEXT NOT NULL,
      alert_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      recommended_action TEXT NOT NULL,
      bank_account_id INTEGER,
      account_name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      metric REAL,
      status TEXT NOT NULL DEFAULT 'active',
      first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      acknowledged_by TEXT,
      acknowledged_at TEXT,
      acknowledgement_note TEXT,
      resolved_at TEXT,
      resolution_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE SET NULL
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_alert_occurrence_key_status ON treasury_alert_occurrences(alert_key, status)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_alert_occurrence_status_severity ON treasury_alert_occurrences(status, severity)`));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_alert_occurrence_first_seen ON treasury_alert_occurrences(first_seen_at)`));

  await db.run(sql.raw(`
    CREATE TABLE IF NOT EXISTS treasury_alert_occurrence_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurrence_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (occurrence_id) REFERENCES treasury_alert_occurrences(id) ON DELETE CASCADE
    )
  `));
  await db.run(sql.raw(`CREATE INDEX IF NOT EXISTS idx_treasury_alert_occurrence_audit_occurrence ON treasury_alert_occurrence_audit(occurrence_id, created_at)`));
}
