import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { ensureTreasuryClosingTaskTables } from "@/app/treasury-closing-tasks-runtime";

async function addColumnIfMissing(statement: string) {
  try {
    await getDb().run(sql.raw(statement));
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!message.includes("duplicate column") && !message.includes("already exists")) throw error;
  }
}

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
      escalation_enabled INTEGER NOT NULL DEFAULT 1,
      critical_ack_sla_minutes INTEGER NOT NULL DEFAULT 30,
      high_ack_sla_minutes INTEGER NOT NULL DEFAULT 120,
      resolution_sla_minutes INTEGER NOT NULL DEFAULT 240,
      updated_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `));
  await addColumnIfMissing("ALTER TABLE treasury_alert_settings ADD COLUMN escalation_enabled INTEGER NOT NULL DEFAULT 1");
  await addColumnIfMissing("ALTER TABLE treasury_alert_settings ADD COLUMN critical_ack_sla_minutes INTEGER NOT NULL DEFAULT 30");
  await addColumnIfMissing("ALTER TABLE treasury_alert_settings ADD COLUMN high_ack_sla_minutes INTEGER NOT NULL DEFAULT 120");
  await addColumnIfMissing("ALTER TABLE treasury_alert_settings ADD COLUMN resolution_sla_minutes INTEGER NOT NULL DEFAULT 240");
  await db.run(sql.raw(`
    INSERT OR IGNORE INTO treasury_alert_settings (
      id, forecast_horizon_days, reconciliation_min_pct, closing_cadence,
      negative_forecast_enabled, critical_tasks_enabled, reconciliation_enabled, closing_overdue_enabled,
      escalation_enabled, critical_ack_sla_minutes, high_ack_sla_minutes, resolution_sla_minutes
    ) VALUES (1, 30, 95, 'daily', 1, 1, 1, 1, 1, 30, 120, 240)
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
      ack_escalated_at TEXT,
      resolution_escalated_at TEXT,
      resolved_at TEXT,
      resolution_reason TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (bank_account_id) REFERENCES treasury_bank_accounts(id) ON DELETE SET NULL
    )
  `));
  await addColumnIfMissing("ALTER TABLE treasury_alert_occurrences ADD COLUMN ack_escalated_at TEXT");
  await addColumnIfMissing("ALTER TABLE treasury_alert_occurrences ADD COLUMN resolution_escalated_at TEXT");
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
